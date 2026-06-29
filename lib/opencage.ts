const OPENCAGE_API_KEY = process.env.OPENCAGE_API_KEY!;

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lng}&key=${OPENCAGE_API_KEY}&no_annotations=1&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return "Unknown location";
    const data = await res.json();
    return data?.results?.[0]?.formatted ?? "Unknown location";
  } catch {
    return "Unknown location";
  }
}
