import axios, { AxiosError } from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Logger } from '../error-handling/Logger';

export interface RequestConfig extends AxiosRequestConfig {
  retryCount?: number;
}

export class HttpClient {
  public axiosInstance: AxiosInstance;
  private partition: string | null = null;
  private static lastErrorLogTimes = new Map<string, number>();
  private authHeader: { token: string; type: string } | null = null;

  constructor(baseURL: string, defaultHeaders: Record<string, string> = {}, partition: string | null = null) {
    this.partition = partition;
    
    // Пытаемся получить Electron API для нативного fetch
    let electronFetch: any = null;
    let electronSession: any = null;
    
    try {
      const { net, session } = require('electron');
      if (net && net.fetch) {
        electronFetch = net.fetch;
        electronSession = this.partition ? session.fromPartition(this.partition) : session.defaultSession;
        Logger.info(`[HttpClient] Bound to session: ${this.partition || 'default'}`);
      }
    } catch (e) {
      // Вне Electron используем стандартный fetch
    }

    const axiosConfig: AxiosRequestConfig = {
      baseURL,
      headers: {
        ...defaultHeaders
      },
      timeout: this.partition ? 45000 : 30000,
    };

    // В Electron используем кастомную обертку для net.fetch только если указан partition (например для SoundCloud)
    if (electronFetch && electronSession && this.partition) {
      axiosConfig.adapter = async (config: any) => {
        // Реализация адаптера через net.fetch с повторными попытками
        const maxRetries = 3;
        let attempt = 0;

        while (attempt < maxRetries) {
          try {
            let url = config.url;
            if (config.baseURL && !url?.startsWith('http://') && !url?.startsWith('https://')) {
              // Избегаем двойного слеша при конкатенации
              url = `${config.baseURL.replace(/\/+$/, '')}/${url?.replace(/^\/+/, '')}`;
            }
            url = url || '';
            
            let body = config.data;
            
            // В Axios 1.x config.headers — это инстанс AxiosHeaders.
            // toJSON() возвращает плоский объект со ВСЕМИ заголовками (common + request).
            const rawHeaders = (config.headers as any)?.toJSON 
              ? (config.headers as any).toJSON() 
              : { ...config.headers };

            const headers: Record<string, string> = {};
            for (const key in rawHeaders) {
              const val = rawHeaders[key];
              if (val !== undefined && val !== null) {
                headers[key] = String(val);
              }
            }

            const method = config.method?.toUpperCase() || 'GET';
            const isPayloadMethod = !['GET', 'HEAD'].includes(method);

            // Сериализуем тело: fetch требует строку, не объект
            let bodyString: string | undefined = undefined;
            if (isPayloadMethod && body !== undefined && body !== null) {
              if (typeof body === 'object' && !(body instanceof Buffer)) {
                bodyString = JSON.stringify(body);
                // Добавляем Content-Type если его нет
                if (!headers['Content-Type'] && !headers['content-type']) {
                  headers['Content-Type'] = 'application/json';
                }
              } else {
                bodyString = String(body);
              }
            }

            // Implement AbortController for true timeout support in net.fetch
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.timeout || 30000);

            const response = await electronFetch(url, {
              method: method,
              headers: headers,
              body: bodyString,
              session: electronSession,
              redirect: 'follow',
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            const responseData = config.responseType === 'json' || !config.responseType 
              ? await response.json().catch(() => ({})) 
              : await response.text();

            if (!response.ok) {
              if (this.shouldLog(config.url)) {
                Logger.error(`[HttpClient] HTTP Error for ${config.url}: [${response.status}] ${response.statusText}`);
                if (responseData && typeof responseData === 'object') {
                  Logger.error(`[HttpClient] Error Body: ${JSON.stringify(responseData)}`);
                }
              }
              const axiosError = new Error(`Request failed with status ${response.status}`) as any;
              axiosError.response = {
                data: responseData,
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                config,
              };
              axiosError.config = config;
              axiosError.isAxiosError = true;
              throw axiosError;
            }

            return {
              data: responseData || {},
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers.entries()),
              config,
              request: {}
            };
          } catch (error: any) {
            
            // Если ошибка в статусе HTTP (например 404, 401), не нужно делать retry
            if (error.isAxiosError && error.response) {
              throw error; 
            }

            // Иначе это сетевая ошибка (ECONNRESET, ERR_NAME_NOT_RESOLVED и т.д.)
            attempt++;
            if (this.shouldLog(config.url)) {
              Logger.warn(`[HttpClient] Network error (${error.message}) for ${config.url}. Retry ${attempt}/${maxRetries}...`);
            }
            
            if (attempt >= maxRetries) {
              if (this.shouldLog(config.url)) {
                Logger.error(`[HttpClient] Adapter Error for ${config.url}: ${error.message}${error.code ? ` (Code: ${error.code})` : ''} after ${maxRetries} attempts`);
              }
              throw error;
            }
            
            // Пауза перед следующей попыткой: 1s, затем 2s
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          }
        }
        
        throw new Error('[HttpClient] Max retries reached or unexpected failure');
      };
    }

    this.axiosInstance = axios.create(axiosConfig);

    this.setupInterceptors();
  }


  private setupInterceptors() {
    this.axiosInstance.interceptors.request.use(async (config) => {
      // Если установлен заголовок авторизации, добавляем его в конфиг
      if (this.authHeader) {
        config.headers.set('Authorization', `${this.authHeader.type} ${this.authHeader.token}`);
      }
      return config;
    });

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config = error.config as RequestConfig;
        if (!config) return Promise.reject(error);
        
        config.retryCount = config.retryCount ?? 0;

        if (error.response?.status === 401) {
          Logger.warn(`[HttpClient] 401 Unauthorized: ${config.url}`);
          throw new Error('UNAUTHORIZED'); 
        }

        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'] 
            ? parseInt(error.response.headers['retry-after'] as string) * 1000 
            : Math.pow(2, config.retryCount) * 1000 + Math.random() * 1000;

          Logger.warn(`[HttpClient] Rate limit (429). Retrying after ${retryAfter}ms`);
          await new Promise(resolve => setTimeout(resolve, retryAfter));
          config.retryCount++;
          return this.axiosInstance(config);
        }

        if (error.response?.status && error.response.status >= 500 && config.retryCount < 3) {
          const delay = Math.pow(2, config.retryCount) * 1000 + Math.random() * 500;
          Logger.error(`[HttpClient] Server error ${error.response.status}. Retry in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          config.retryCount++;
          return this.axiosInstance(config);
        }

        const url = config.url || 'unknown';
        if (error.code) {
          if (this.shouldLog(url)) {
            Logger.error(`[HttpClient] Network error code: ${error.code} for URL: ${url}`);
          }
        }
        
        if (this.shouldLog(url)) {
          Logger.error(`[HttpClient] Request failed for ${url}: ${error.message}${error.code === 'ECONNRESET' || error.code === 'ECONNABORTED' ? ' (Check Proxy/VPN)' : ''}`);
        }
        return Promise.reject(error);
      }
    );
  }

  private shouldLog(url: string): boolean {
    if (url === 'unknown') return true;
    const now = Date.now();
    const lastTime = HttpClient.lastErrorLogTimes.get(url) || 0;
    if (now - lastTime < 60000) return false;
    HttpClient.lastErrorLogTimes.set(url, now);
    return true;
  }

  public async get<T>(url: string, config?: RequestConfig): Promise<T> {
    const response = await this.axiosInstance.get<T>(url, config);
    return response.data;
  }

  public async post<T>(url: string, data?: any, config?: RequestConfig): Promise<T> {
    const response = await this.axiosInstance.post<T>(url, data, config);
    return response.data;
  }

  public async put<T>(url: string, data?: any, config?: RequestConfig): Promise<T> {
    const response = await this.axiosInstance.put<T>(url, data, config);
    return response.data;
  }

  public async delete<T>(url: string, config?: RequestConfig): Promise<T> {
    const response = await this.axiosInstance.delete<T>(url, config);
    return response.data;
  }

  public setAuthorizationHeader(token: string, type: string = 'Bearer') {
    this.authHeader = { token, type };
  }
}
