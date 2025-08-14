import TraktAPI from '@server/api/trakt';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const traktRoutes = Router();

/**
 * GET /trakt/auth-url
 * Get the Trakt OAuth authorization URL
 */
traktRoutes.get('/auth-url', async (req, res) => {
  const settings = getSettings();

  if (!settings.trakt.clientId || !settings.trakt.clientSecret) {
    return res.status(400).json({
      error: 'Trakt client ID and secret must be configured',
    });
  }

  const traktApi = new TraktAPI(
    settings.trakt.clientId,
    settings.trakt.clientSecret,
    settings.trakt.accessToken
  );

  return res.status(200).json({
    authUrl: traktApi.getAuthUrl(),
  });
});

/**
 * GET /trakt/callback
 * OAuth callback from Trakt
 */
traktRoutes.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        error: 'Authorization code is required',
      });
    }

    const settings = getSettings();

    if (!settings.trakt.clientId || !settings.trakt.clientSecret) {
      throw new Error('Trakt client ID and secret must be configured');
    }

    const traktApi = new TraktAPI(
      settings.trakt.clientId,
      settings.trakt.clientSecret
    );

    // Exchange code for access token
    const authResponse = await traktApi.authorize(code);

    // Get user profile
    traktApi.setAccessToken(authResponse.access_token);
    const userProfile = await traktApi.getUserProfile();

    // Save settings
    settings.trakt.accessToken = authResponse.access_token;
    settings.trakt.refreshToken = authResponse.refresh_token;
    settings.trakt.username = userProfile.username;
    settings.trakt.enabled = true;
    settings.save();

    logger.info('User authenticated successfully with Trakt', {
      label: 'Trakt',
      username: userProfile.username,
    });

    // Redirect to settings page
    const baseUrl = settings.main.applicationUrl || 'http://localhost:3000';
    return res.redirect(`${baseUrl}/settings/trakt?trakt=success`);
  } catch (error) {
    logger.error('Failed to authenticate with Trakt', {
      label: 'Trakt',
      error: error.message,
    });

    // Redirect to settings page with error
    const settings = getSettings();
    const baseUrl = settings.main.applicationUrl || 'http://localhost:3000';
    return res.redirect(
      `${baseUrl}/settings/trakt?trakt=error&message=${encodeURIComponent(
        error.message
      )}`
    );
  }
});

/**
 * GET /trakt/me
 * Get the current authenticated Trakt user
 */
traktRoutes.get('/me', async (req, res, next) => {
  try {
    const settings = getSettings();

    if (!settings.trakt.accessToken) {
      return res.status(404).json({
        connected: false,
        username: null,
      });
    }

    const traktApi = new TraktAPI(
      settings.trakt.clientId || '',
      settings.trakt.clientSecret || '',
      settings.trakt.accessToken
    );

    try {
      const userProfile = await traktApi.getUserProfile();
      return res.status(200).json({
        connected: true,
        username: userProfile.username,
        name: userProfile.name,
        vip: userProfile.vip,
        avatar: userProfile.images?.avatar?.full,
      });
    } catch (error) {
      // Token might be expired
      logger.error('Failed to get Trakt user profile', {
        label: 'Trakt',
        error: error.message,
      });
      return res.status(401).json({
        connected: false,
        username: null,
      });
    }
  } catch (error) {
    logger.error('Failed to fetch Trakt user', {
      label: 'Trakt',
      error: error.message,
    });
    next({
      status: 500,
      message: error.message,
    });
  }
});

/**
 * POST /trakt/disconnect
 * Disconnect from Trakt
 */
traktRoutes.post('/disconnect', async (req, res, next) => {
  try {
    const settings = getSettings();

    if (!settings.trakt.accessToken) {
      return res.status(400).json({
        error: 'Not connected to Trakt',
      });
    }

    const traktApi = new TraktAPI(
      settings.trakt.clientId || '',
      settings.trakt.clientSecret || '',
      settings.trakt.accessToken
    );

    try {
      // Try to revoke token
      await traktApi.revokeToken();
    } catch (error) {
      // Even if revoking fails, continue with disconnect
      logger.warn('Failed to revoke Trakt token', {
        label: 'Trakt',
        error: error.message,
      });
    }

    // Clear settings
    settings.trakt.accessToken = '';
    settings.trakt.refreshToken = '';
    settings.trakt.username = '';
    settings.trakt.enabled = false;
    settings.save();

    logger.info('User disconnected from Trakt', {
      label: 'Trakt',
    });

    return res.status(200).json({
      message: 'Successfully disconnected from Trakt',
    });
  } catch (error) {
    logger.error('Failed to disconnect from Trakt', {
      label: 'Trakt',
      error: error.message,
    });
    next({
      status: 500,
      message: error.message,
    });
  }
});

/**
 * POST /trakt/settings
 * Update Trakt settings
 */
traktRoutes.post('/settings', async (req, res, next) => {
  try {
    const { clientId, clientSecret, syncWatchlist } = req.body;

    const settings = getSettings();

    if (clientId !== undefined) {
      settings.trakt.clientId = clientId;
    }

    if (clientSecret !== undefined) {
      settings.trakt.clientSecret = clientSecret;
    }

    if (typeof syncWatchlist === 'boolean') {
      settings.trakt.syncWatchlist = syncWatchlist;
    }

    settings.save();

    logger.info('Trakt settings updated', {
      label: 'Trakt',
    });

    return res.status(200).json({
      clientId: settings.trakt.clientId,
      clientSecret: '***', // Don't return the secret
      syncWatchlist: settings.trakt.syncWatchlist,
    });
  } catch (error) {
    logger.error('Failed to update Trakt settings', {
      label: 'Trakt',
      error: error.message,
    });
    next({
      status: 500,
      message: error.message,
    });
  }
});

/**
 * POST /trakt/test-connection
 * Test the Trakt connection
 */
traktRoutes.post('/test-connection', async (req, res, next) => {
  try {
    const settings = getSettings();

    if (!settings.trakt.clientId || !settings.trakt.clientSecret) {
      return res.status(400).json({
        error: 'Trakt client ID and secret must be configured',
      });
    }

    if (!settings.trakt.accessToken) {
      return res.status(400).json({
        error: 'Not connected to Trakt',
        connected: false,
      });
    }

    const traktApi = new TraktAPI(
      settings.trakt.clientId,
      settings.trakt.clientSecret,
      settings.trakt.accessToken
    );

    const isConnected = await traktApi.testConnection();

    return res.status(200).json({
      connected: isConnected,
      username: settings.trakt.username,
    });
  } catch (error) {
    logger.error('Failed to test Trakt connection', {
      label: 'Trakt',
      error: error.message,
    });
    next({
      status: 500,
      message: error.message,
    });
  }
});

/**
 * GET /trakt/watchlist
 * Get the user's watchlist
 */
traktRoutes.get('/watchlist', async (req, res, next) => {
  try {
    const settings = getSettings();

    if (!settings.trakt.accessToken) {
      return res.status(401).json({
        error: 'Not connected to Trakt',
      });
    }

    const traktApi = new TraktAPI(
      settings.trakt.clientId || '',
      settings.trakt.clientSecret || '',
      settings.trakt.accessToken
    );

    const type = (req.query.type as 'movies' | 'shows') || 'movies';
    const watchlist = await traktApi.getWatchlist(type);

    return res.status(200).json({
      type,
      items: watchlist,
      count: watchlist.length,
    });
  } catch (error) {
    logger.error('Failed to fetch Trakt watchlist', {
      label: 'Trakt',
      error: error.message,
    });
    next({
      status: 500,
      message: error.message,
    });
  }
});

/**
 * POST /trakt/watchlist/add
 * Add items to watchlist
 */
traktRoutes.post('/watchlist/add', async (req, res, next) => {
  try {
    const { mediaType, title, year, tmdbId } = req.body;

    if (!mediaType || !tmdbId) {
      return res.status(400).json({
        error: 'mediaType and tmdbId are required',
      });
    }

    const settings = getSettings();

    if (!settings.trakt.accessToken) {
      return res.status(401).json({
        error: 'Not connected to Trakt',
      });
    }

    const traktApi = new TraktAPI(
      settings.trakt.clientId || '',
      settings.trakt.clientSecret || '',
      settings.trakt.accessToken
    );

    type TraktItems = {
      movies?: { tmdb: number; title: string; year: number }[];
      shows?: { tmdb: number; title: string; year: number }[];
    };

    const items: TraktItems = {};

    if (mediaType === 'movie') {
      items.movies = [
        {
          tmdb: tmdbId,
          title: title || '',
          year: year || 0,
        },
      ];
    } else if (mediaType === 'tv') {
      items.shows = [
        {
          tmdb: tmdbId,
          title: title || '',
          year: year || 0,
        },
      ];
    } else {
      return res.status(400).json({
        error: 'Invalid mediaType. Must be "movie" or "tv"',
      });
    }

    const result = await traktApi.addToWatchlist(items);

    logger.info('Added item to Trakt watchlist', {
      label: 'Trakt',
      mediaType,
      tmdbId,
    });

    return res.status(200).json(result);
  } catch (error) {
    logger.error('Failed to add item to Trakt watchlist', {
      label: 'Trakt',
      error: error.message,
    });
    next({
      status: 500,
      message: error.message,
    });
  }
});

export default traktRoutes;
