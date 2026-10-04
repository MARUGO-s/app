export function hasGoogleIdentity(user) {
    return user?.app_metadata?.provider === 'google'
        || user?.app_metadata?.providers?.includes('google') === true;
}

export function verifiedGoogleProfile(profile) {
    return Boolean(profile?.id && String(profile.display_id || '').trim()
        && String(profile.store_name || '').trim());
}

export function googleLoginOptions(baseUrl, origin) {
    return { provider: 'google', options: { redirectTo: new URL(baseUrl, origin).href, skipBrowserRedirect: true } };
}

export function googleCallbackError(href) {
    const url = new URL(href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    if (!url.searchParams.has('error') && !fragment.has('error')) return null;
    for (const key of ['error', 'error_code', 'error_description']) {
        url.searchParams.delete(key);
        fragment.delete(key);
    }
    url.hash = fragment.toString();
    return { message: 'Googleログインが完了しませんでした。もう一度お試しください。', cleanUrl: url.pathname + url.search + url.hash };
}
