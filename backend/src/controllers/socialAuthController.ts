import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { success } from '../utils/apiResponse';
import { config } from '../config';
import {
  loginOrRegisterWithSocial,
  verifyFacebookAccessToken,
  verifyGoogleIdToken,
} from '../services/socialAuthService';
import { setCustomerAuthCookies } from '../lib/customerCookies';
import { respondWithCustomerAuth } from '../lib/customerAuthResponse';
import { accessExpiresAtMsFromToken } from '../lib/jwtExpiry';

const googleLoginSchema = z.object({
  idToken: z.string().min(1),
});

const facebookLoginSchema = z.object({
  accessToken: z.string().min(1),
});

function facebookOAuthCallbackUrl(): string {
  const base = config.apiBaseUrl.replace(/\/$/, '');
  return `${base}/api/auth/facebook/callback`;
}

function safeReturnTo(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/account';
  }
  return raw;
}

function oauthErrorRedirect(message: string) {
  const params = new URLSearchParams({ error: message });
  return `${config.frontendUrl.replace(/\/$/, '')}/account/oauth/callback?${params.toString()}`;
}

export async function googleLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const { idToken } = googleLoginSchema.parse(req.body);
    const profile = await verifyGoogleIdToken(idToken);
    const result = await loginOrRegisterWithSocial(profile);
    return success(
      res,
      respondWithCustomerAuth(res, req, {
        token: result.token,
        refreshToken: result.refreshToken,
        user: result.user,
        accessExpiresAt: accessExpiresAtMsFromToken(result.token),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function facebookLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const { accessToken } = facebookLoginSchema.parse(req.body);
    const profile = await verifyFacebookAccessToken(accessToken);
    const result = await loginOrRegisterWithSocial(profile);
    return success(
      res,
      respondWithCustomerAuth(res, req, {
        token: result.token,
        refreshToken: result.refreshToken,
        user: result.user,
        accessExpiresAt: accessExpiresAtMsFromToken(result.token),
      }),
    );
  } catch (err) {
    next(err);
  }
}

/** Browser redirect flow — works on http://localhost (FB JS SDK login requires HTTPS). */
export function startFacebookOAuth(req: Request, res: Response) {
  const returnTo = safeReturnTo(req.query.returnTo);
  if (!config.facebook.appId || !config.facebook.appSecret) {
    return res.redirect(oauthErrorRedirect('Facebook login is not configured'));
  }

  const state = jwt.sign(
    { returnTo, purpose: 'facebook_oauth' },
    config.jwtSecret,
    { expiresIn: '10m' },
  );

  const redirectUri = encodeURIComponent(facebookOAuthCallbackUrl());
  const scope = encodeURIComponent('public_profile,email');
  const url =
    `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(config.facebook.appId)}` +
    `&redirect_uri=${redirectUri}&state=${encodeURIComponent(state)}&scope=${scope}&response_type=code`;

  return res.redirect(url);
}

export async function facebookOAuthCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const { code, state, error, error_description: errorDescription } = req.query;

    if (error) {
      const message = String(errorDescription || error || 'Facebook sign-in was cancelled');
      return res.redirect(oauthErrorRedirect(message));
    }

    if (!code || !state) {
      return res.redirect(oauthErrorRedirect('Missing Facebook authorization code'));
    }

    let payload: { returnTo?: string; purpose?: string };
    try {
      payload = jwt.verify(String(state), config.jwtSecret) as { returnTo?: string; purpose?: string };
    } catch {
      return res.redirect(oauthErrorRedirect('Sign-in session expired. Please try again.'));
    }

    if (payload.purpose !== 'facebook_oauth') {
      return res.redirect(oauthErrorRedirect('Invalid sign-in state'));
    }

    const redirectUri = facebookOAuthCallbackUrl();
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${encodeURIComponent(config.facebook.appId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&client_secret=${encodeURIComponent(config.facebook.appSecret)}` +
        `&code=${encodeURIComponent(String(code))}`,
    );

    if (!tokenRes.ok) {
      return res.redirect(oauthErrorRedirect('Could not complete Facebook sign-in'));
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      return res.redirect(oauthErrorRedirect('Could not complete Facebook sign-in'));
    }

    const profile = await verifyFacebookAccessToken(tokenData.access_token);
    const result = await loginOrRegisterWithSocial(profile);
    const returnTo = safeReturnTo(payload.returnTo);

    setCustomerAuthCookies(res, result.token, result.refreshToken);

    const params = new URLSearchParams({ returnTo });
    const frontend = config.frontendUrl.replace(/\/$/, '');
    return res.redirect(`${frontend}/account/oauth/callback?${params.toString()}`);
  } catch (err) {
    next(err);
  }
}

/** Public OAuth client IDs for the login page (secrets stay server-side). */
export async function getSocialConfig(_req: Request, res: Response) {
  return success(res, {
    google: {
      enabled: Boolean(config.google.clientId),
      clientId: config.google.clientId || null,
    },
    facebook: {
      enabled: Boolean(config.facebook.appId && config.facebook.appSecret),
      appId: config.facebook.appId || null,
    },
  });
}
