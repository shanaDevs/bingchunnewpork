import { prisma } from '../lib/prisma';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';
import { issueCustomerTokens } from '../lib/userSession';
import { toCustomerUserPayload } from '../lib/userAccount';

export type SocialProvider = 'google' | 'facebook';

export interface SocialProfile {
  provider: SocialProvider;
  providerId: string;
  email?: string | null;
  name: string;
}

function syntheticPhone(provider: SocialProvider, providerId: string) {
  return `${provider}:${providerId}`;
}

export async function verifyGoogleIdToken(idToken: string): Promise<SocialProfile> {
  if (!config.google.clientId) {
    throw new AppError('Google login is not configured on the server', 503);
  }

  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!res.ok) throw new AppError('Invalid Google sign-in token', 401);

  const data = (await res.json()) as {
    sub: string;
    email?: string;
    name?: string;
    aud: string;
    email_verified?: string | boolean;
  };

  if (data.aud !== config.google.clientId) {
    throw new AppError('Invalid Google sign-in token', 401);
  }

  return {
    provider: 'google',
    providerId: data.sub,
    email: data.email?.toLowerCase(),
    name: data.name || data.email?.split('@')[0] || 'Bing Chun User',
  };
}

export async function verifyFacebookAccessToken(accessToken: string): Promise<SocialProfile> {
  if (!config.facebook.appId || !config.facebook.appSecret) {
    throw new AppError('Facebook login is not configured on the server', 503);
  }

  const appToken = `${config.facebook.appId}|${config.facebook.appSecret}`;
  const debugRes = await fetch(
    `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`
  );
  if (!debugRes.ok) throw new AppError('Invalid Facebook sign-in token', 401);

  const debug = (await debugRes.json()) as {
    data?: { is_valid?: boolean; app_id?: string; user_id?: string };
  };

  if (!debug.data?.is_valid || debug.data.app_id !== config.facebook.appId) {
    throw new AppError('Invalid Facebook sign-in token', 401);
  }

  const meRes = await fetch(
    `https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`
  );
  if (!meRes.ok) throw new AppError('Could not load Facebook profile', 401);

  const me = (await meRes.json()) as { id: string; name?: string; email?: string };

  return {
    provider: 'facebook',
    providerId: me.id,
    email: me.email?.toLowerCase(),
    name: me.name || me.email?.split('@')[0] || 'Bing Chun User',
  };
}

export async function loginOrRegisterWithSocial(profile: SocialProfile) {
  const providerField = profile.provider === 'google' ? 'googleId' : 'facebookId';
  const phone = syntheticPhone(profile.provider, profile.providerId);

  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { [providerField]: profile.providerId },
        ...(profile.email ? [{ email: profile.email }] : []),
      ],
    },
  });

  if (user?.deletedAt) {
    const { token, refreshToken } = await issueCustomerTokens(user.id);
    return { token, refreshToken, user: toCustomerUserPayload(user) };
  }

  if (user) {
    const updates: {
      googleId?: string;
      facebookId?: string;
      email?: string;
      isEmailVerified?: boolean;
      name?: string;
    } = {};

    if (profile.provider === 'google' && !user.googleId) updates.googleId = profile.providerId;
    if (profile.provider === 'facebook' && !user.facebookId) updates.facebookId = profile.providerId;
    if (profile.email && !user.email) updates.email = profile.email;
    if (profile.email) updates.isEmailVerified = true;
    if (user.name === 'Guest' || user.name === 'Bing Chun User') updates.name = profile.name;

    if (Object.keys(updates).length > 0) {
      user = await prisma.user.update({ where: { id: user.id }, data: updates });
    }
  } else {
    user = await prisma.user.create({
      data: {
        name: profile.name,
        phone,
        email: profile.email,
        [providerField]: profile.providerId,
        isEmailVerified: !!profile.email,
        isPhoneVerified: false,
      },
    });
  }

  const { token, refreshToken } = await issueCustomerTokens(user.id);

  return {
    token,
    refreshToken,
    user: toCustomerUserPayload(user),
  };
}
