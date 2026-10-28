export const SITE = {
  title: "WSA Reserveringen",
  shortTitle: "WSA",
  clubName: "Water Sportvereniging Amstelveen",
  url: "https://wsa-reservation.mteke.com",
  github: "https://github.com/melihteke/wsa-reservation",
  logbook: "https://sail.mteke.com",
  timeZone: "Europe/Amsterdam",
  /** Live wind and the Windy map are centred here. */
  windSpot: {
    name: "De Poel, Amstelveen",
    lat: 52.2984,
    lon: 4.8395,
  },
  /** The clubhouse and the jetty. */
  club: {
    lat: 52.2934098,
    lon: 4.8427479,
    mapsUrl: "https://maps.app.goo.gl/9AkHJtUn6CvWfg8o9",
  },
} as const;

export const SUPABASE = {
  url: import.meta.env.PUBLIC_SUPABASE_URL as string | undefined,
  anonKey: import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined,
};
