const DiscordRPC = require('discord-rpc');
const { Logger } = require('../error-handling/Logger');

class DiscordManager {
  private clientId: string;
  private client: any;
  private isConnected: boolean;
  private currentTrack: any;
  private isPlaying: boolean;
  private startTime: number | null;

  constructor() {
    this.clientId = '1331774431871242312'; // NMIS Official RPC ID Placeholder
    this.client = null;
    this.isConnected = false;
    this.currentTrack = null;
    this.isPlaying = false;
    this.startTime = null;
  }

  async connect() {
    if (this.isConnected) return;

    try {
      this.client = new DiscordRPC.Client({ transport: 'ipc' });
      
      this.client.on('ready', () => {
        Logger.info('[Discord] RPC Client Ready');
        this.isConnected = true;
        if (this.currentTrack) {
          this.updatePresence();
        }
      });

      this.client.on('disconnected', () => {
        Logger.warn('[Discord] RPC Client Disconnected');
        this.isConnected = false;
        this.reconnect();
      });

      await this.client.login({ clientId: this.clientId });
    } catch (error: any) {
      Logger.error('[Discord] Failed to connect:', error?.message || 'Unknown error');
      this.reconnect();
    }
  }

  reconnect() {
    setTimeout(() => {
      this.connect().catch(() => {});
    }, 15000);
  }

  update(track: any, isPlaying: boolean) {
    this.currentTrack = track;
    this.isPlaying = isPlaying;
    
    if (isPlaying) {
      this.startTime = Date.now();
    } else {
      this.startTime = null;
    }

    if (this.isConnected) {
      this.updatePresence();
    } else {
      this.connect().catch(() => {});
    }
  }

  updatePresence() {
    if (!this.client || !this.isConnected) return;

    try {
      if (!this.isPlaying || !this.currentTrack) {
        this.client.clearActivity();
        return;
      }

      const activity: any = {
        details: this.currentTrack.title,
        state: `by ${this.currentTrack.artist}`,
        largeImageKey: 'nexus_logo', // Must be uploaded to Discord Developer Portal
        largeImageText: 'Nexus Music sharing',
        smallImageKey: this.isPlaying ? 'play_icon' : 'pause_icon',
        smallImageText: this.isPlaying ? 'Playing' : 'Paused',
        instance: false,
      };

      if (this.isPlaying && this.startTime) {
        activity.startTimestamp = this.startTime;
        // Optionally add endTimestamp if tracking total length
        if (this.currentTrack.durationMs) {
           activity.endTimestamp = Date.now() + (this.currentTrack.durationMs - (this.currentTrack.progressMs || 0));
        }
      }

      this.client.setActivity(activity);
    } catch (error: any) {
      Logger.error('[Discord] Failed to update presence:', error?.message || 'Unknown error');
    }
  }

  clear() {
    if (this.client && this.isConnected) {
      this.client.clearActivity();
    }
  }
}

module.exports = { DiscordManager: new DiscordManager() };
