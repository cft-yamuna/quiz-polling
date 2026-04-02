const configuredAppBaseUrl = import.meta.env.VITE_APP_BASE_URL?.trim();

export function getAppBaseUrl() {
  if (configuredAppBaseUrl) {
    return configuredAppBaseUrl.replace(/\/$/, '');
  }

  return window.location.origin.replace(/\/$/, '');
}

export function buildPollUrl(route: 'main' | 'user' | 'control', pollId: string) {
  return `${getAppBaseUrl()}/${route}/${pollId}`;
}
