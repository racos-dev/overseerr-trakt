import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import ExternalAPI from './externalapi';

interface TraktAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
}

interface TraktUser {
  username: string;
  private: boolean;
  name: string;
  vip: boolean;
  vip_ep: boolean;
  ids: {
    slug: string;
    uuid: string;
  };
  joined_at: string;
  location: string;
  about: string;
  gender: string;
  age: number;
  images: {
    avatar: {
      full: string;
    };
  };
}

interface TraktWatchlistItem {
  rank: number;
  listed_at: string;
  type: 'movie' | 'show';
  movie?: {
    title: string;
    year: number;
    ids: {
      trakt: number;
      slug: string;
      imdb: string;
      tmdb: number;
    };
  };
  show?: {
    title: string;
    year: number;
    ids: {
      trakt: number;
      slug: string;
      tvdb: number;
      imdb: string;
      tmdb: number;
    };
  };
}

interface TraktSyncResponse {
  added: {
    movies: number;
    episodes: number;
  };
  existing: {
    movies: number;
    episodes: number;
  };
  not_found: {
    movies: number;
    episodes: number;
  };
}

interface TraktListItem {
  listed_at: string;
  type: 'movie' | 'show';
  movie?: TraktSyncMovie;
  show?: TraktSyncShow;
}

interface TraktSyncMovie {
  title: string;
  year: number;
  ids: {
    trakt: number;
    slug: string;
    imdb: string;
    tmdb: number;
  };
}

interface TraktSyncShow {
  title: string;
  year: number;
  ids: {
    trakt: number;
    slug: string;
    tvdb: number;
    imdb: string;
    tmdb: number;
  };
}

interface TraktWatchedItem {
  plays: number;
  last_watched_at: string;
  last_updated_at: string;
  movie?: TraktSyncMovie;
  show?: TraktSyncShow;
  season?: number;
  number?: number;
}

class TraktAPI extends ExternalAPI {
  private clientId: string;
  private clientSecret: string;
  private accessToken?: string;
  private refreshToken?: string;

  constructor(clientId: string, clientSecret: string, accessToken?: string) {
    super(
      'https://api.trakt.tv',
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          'trakt-api-version': '2',
          'trakt-api-key': clientId,
        },
        rateLimit: {
          maxRPS: 1,
          maxRequests: 1000,
        },
      }
    );
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = accessToken;

    // If accessToken is provided, set the Authorization header
    if (accessToken) {
      this.axios.defaults.headers.common[
        'Authorization'
      ] = `Bearer ${accessToken}`;
    }
  }

  public setAccessToken(accessToken: string): void {
    this.accessToken = accessToken;
    this.axios.defaults.headers.common[
      'Authorization'
    ] = `Bearer ${accessToken}`;
  }

  public setRefreshToken(refreshToken: string): void {
    this.refreshToken = refreshToken;
  }

  public getAccessToken(): string | undefined {
    return this.accessToken;
  }

  public getRefreshToken(): string | undefined {
    return this.refreshToken;
  }

  /**
   * Exchange authorization code for access token
   */
  public async authorize(code: string): Promise<TraktAuthResponse> {
    try {
      const response = await this.axios.post<TraktAuthResponse>(
        '/oauth/token',
        {
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.getRedirectUri(),
          grant_type: 'authorization_code',
        }
      );

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      this.axios.defaults.headers.common[
        'Authorization'
      ] = `Bearer ${this.accessToken}`;

      return response.data;
    } catch (error) {
      throw new Error(
        `Failed to authorize with Trakt: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  }

  /**
   * Refresh the access token
   */
  public async refreshAccessToken(): Promise<TraktAuthResponse> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await this.axios.post<TraktAuthResponse>(
        '/oauth/token',
        {
          refresh_token: this.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.getRedirectUri(),
          grant_type: 'refresh_token',
        }
      );

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      this.axios.defaults.headers.common[
        'Authorization'
      ] = `Bearer ${this.accessToken}`;

      return response.data;
    } catch (error) {
      throw new Error(
        `Failed to refresh access token: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  }

  /**
   * Revoke the access token
   */
  public async revokeToken(): Promise<void> {
    try {
      await this.axios.post('/oauth/revoke', {
        token: this.accessToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });
    } catch (error) {
      // Even if revoking fails, continue with disconnect
      throw new Error(
        `Failed to revoke token: ${
          error.response?.data?.error || error.message
        }`
      );
    } finally {
      this.accessToken = undefined;
      this.refreshToken = undefined;
      delete this.axios.defaults.headers.common['Authorization'];
    }
  }

  /**
   * Get the current authenticated user's profile
   */
  public async getUserProfile(): Promise<TraktUser> {
    try {
      return this.get<TraktUser>('/users/me');
    } catch (error) {
      throw new Error(
        `Failed to get user profile: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  }

  /**
   * Get the user's watchlist
   */
  public async getWatchlist(
    type: 'movies' | 'shows' = 'movies'
  ): Promise<TraktWatchlistItem[]> {
    try {
      return this.get<TraktWatchlistItem[]>(`/users/me/watchlist/${type}`);
    } catch (error) {
      throw new Error(
        `Failed to get watchlist: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  }

  /**
   * Get the user's collection
   */
  public async getCollection(
    type: 'movies' | 'shows' = 'movies'
  ): Promise<TraktListItem[]> {
    try {
      return this.get<TraktListItem[]>(`/users/me/collection/${type}`);
    } catch (error) {
      throw new Error(
        `Failed to get collection: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  }

  /**
   * Get the user's watched history
   */
  public async getWatched(
    type: 'movies' | 'shows' = 'movies'
  ): Promise<TraktWatchedItem[]> {
    try {
      return this.get<TraktWatchedItem[]>(`/users/me/watched/${type}`);
    } catch (error) {
      throw new Error(
        `Failed to get watched history: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  }

  /**
   * Add items to watchlist
   */
  public async addToWatchlist(items: {
    movies?: { tmdb: number; title: string; year: number }[];
    shows?: { tmdb: number; title: string; year: number }[];
  }): Promise<TraktSyncResponse> {
    try {
      return this.post<TraktSyncResponse>('/sync/watchlist', items);
    } catch (error) {
      throw new Error(
        `Failed to add to watchlist: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  }

  /**
   * Remove items from watchlist
   */
  public async removeFromWatchlist(items: {
    movies?: { tmdb: number }[];
    shows?: { tmdb: number }[];
  }): Promise<TraktSyncResponse> {
    try {
      return this.post<TraktSyncResponse>('/sync/watchlist/remove', items);
    } catch (error) {
      throw new Error(
        `Failed to remove from watchlist: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  }

  /**
   * Add items to collection
   */
  public async addToCollection(items: {
    movies?: { tmdb: number; title: string; year: number }[];
    shows?: { tmdb: number; title: string; year: number }[];
  }): Promise<TraktSyncResponse> {
    try {
      return this.post<TraktSyncResponse>('/sync/collection', items);
    } catch (error) {
      throw new Error(
        `Failed to add to collection: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  }

  /**
   * Remove items from collection
   */
  public async removeFromCollection(items: {
    movies?: { tmdb: number }[];
    shows?: { tmdb: number }[];
  }): Promise<TraktSyncResponse> {
    try {
      return this.post<TraktSyncResponse>('/sync/collection/remove', items);
    } catch (error) {
      throw new Error(
        `Failed to remove from collection: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  }

  /**
   * Test connection to Trakt API
   */
  public async testConnection(): Promise<boolean> {
    try {
      await this.getUserProfile();
      return true;
    } catch (error) {
      // Log the error for debugging
      logger.error('Trakt API connection test failed', {
        label: 'Trakt',
        error: error.response?.data || error.message,
      });
      return false;
    }
  }

  /**
   * Get the OAuth redirect URI
   */
  private getRedirectUri(): string {
    try {
      // In production, this should come from settings or environment variable
      const settings = getSettings();
      const baseUrl =
        settings.main.applicationUrl ||
        process.env.NEXT_PUBLIC_APPLICATION_URL ||
        'http://localhost:3000';
      return `${baseUrl}/api/v1/trakt/callback`;
    } catch (e) {
      // Fallback to environment variable or localhost
      const baseUrl =
        process.env.NEXT_PUBLIC_APPLICATION_URL || 'http://localhost:3000';
      return `${baseUrl}/api/v1/trakt/callback`;
    }
  }

  /**
   * Get the authorization URL
   */
  public getAuthUrl(): string {
    const redirectUri = this.getRedirectUri();
    return `https://trakt.tv/oauth/authorize?response_type=code&client_id=${
      this.clientId
    }&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }
}

export default TraktAPI;
