import { findStation } from './stations.ts';

export function stationFromSearch(search: string): string | undefined {
  const id = new URLSearchParams(search).get('station');
  return id && findStation(id) ? id : undefined;
}

export function stationUrl(id: string, currentUrl: string): string {
  const url = new URL(currentUrl);
  url.searchParams.set('station', id);
  if (url.hash === '#departures') url.hash = '';
  return `${url.pathname}${url.search}${url.hash}`;
}
