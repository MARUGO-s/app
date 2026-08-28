const REDIRECT_ENV_KEY = "VITE_SUPABASE_AUTH_REDIRECT_URL";

let warnedInvalidConfiguredRedirect = false;
let warnedLocalRedirect = false;

const getConfiguredRedirectUrl = () => {
    if (typeof import.meta !== "undefined") {
        return String(import.meta.env[REDIRECT_ENV_KEY] || "").trim();
    }
    return "";
};

const getBaseUrl = () => {
    if (typeof import.meta !== "undefined") {
        return String(import.meta.env.BASE_URL || "/").trim() || "/";
    }
    return "/";
};

const isLocalHostname = (hostname) => {
    const value = String(hostname || "").toLowerCase();
    return value === "localhost" || value === "127.0.0.1" || value === "[::1]";
};

const toHttpUrl = (value) => {
    try {
        const parsed = new URL(value);
        const protocol = String(parsed.protocol || "").toLowerCase();
        if (protocol === "http:" || protocol === "https:") {
            return parsed.toString();
        }
    } catch {
        // ignore
    }
    return "";
};

const resolveConfiguredRedirectUrl = () => {
    const configured = getConfiguredRedirectUrl();
    if (!configured) return "";

    const absolute = toHttpUrl(configured);
    if (absolute) return absolute;

    if (typeof window !== "undefined") {
        try {
            return new URL(configured, window.location.origin).toString();
        } catch {
            // fall through to warning below
        }
    }

    if (!warnedInvalidConfiguredRedirect) {
        warnedInvalidConfiguredRedirect = true;
        console.warn(`[Auth] ${REDIRECT_ENV_KEY} is invalid: "${configured}". Falling back to app base URL.`);
    }
    return "";
};

export const getAuthRedirectUrl = () => {
    const configuredRedirect = resolveConfiguredRedirectUrl();
    if (configuredRedirect) {
        return configuredRedirect;
    }

    if (typeof window === "undefined") return "";

    try {
        return new URL(getBaseUrl(), window.location.origin).toString();
    } catch {
        return window.location.origin;
    }
};

export const isUsingLocalAuthRedirect = () => {
    const redirectUrl = getAuthRedirectUrl();
    if (!redirectUrl) return false;
    try {
        return isLocalHostname(new URL(redirectUrl).hostname);
    } catch {
        return false;
    }
};

export const warnIfUsingLocalAuthRedirect = (flowName = "auth") => {
    if (warnedLocalRedirect) return;
    if (!isUsingLocalAuthRedirect()) return;
    warnedLocalRedirect = true;
    console.warn(`[Auth] ${flowName} redirect is localhost. Set ${REDIRECT_ENV_KEY} for production.`);
};
