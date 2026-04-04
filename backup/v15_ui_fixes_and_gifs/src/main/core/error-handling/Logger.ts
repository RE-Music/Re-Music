import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export class Logger {
  private static logFilePath: string;

  public static init() {
    // В Electron app может быть не готов сразу, но мы безопасно берем путь
    const userDataPath = app ? app.getPath('userData') : process.cwd();
    this.logFilePath = path.join(userDataPath, 'nano-mus.log');
  }

  private static formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  }

  private static writeToFile(data: string) {
    if (!this.logFilePath) this.init();
    try {
      fs.appendFileSync(this.logFilePath, data);
    } catch (e) {
      console.error('Failed to write to log file:', e);
    }
  }

  public static info(message: string) {
    const log = this.formatMessage('info', message);
    console.log(log.trim());
    this.writeToFile(log);
  }

  public static warn(message: string) {
    const log = this.formatMessage('warn', message);
    console.warn(log.trim());
    this.writeToFile(log);
  }

  public static error(message: string, error?: any) {
    const errObj = error ? `\n${error.stack || error}` : '';
    const log = this.formatMessage('error', message + errObj);
    console.error(log.trim());
    this.writeToFile(log);
  }
}
