const ZILLOW_HOMES_BASE_URL = "https://www.zillow.com/homes";

export function zillowAddressUrl(address: string): string {
  const slug = `${address.replace(/#/g, " Apt ")}, San Francisco, CA`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${ZILLOW_HOMES_BASE_URL}/${slug}_rb/`;
}
