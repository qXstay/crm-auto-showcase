export type DemoBookingSettingsPost = {
  id: string;
  name: string;
};

export type DemoBookingSettingsStore = {
  publicSlug: string;
  posts: DemoBookingSettingsPost[];
};
