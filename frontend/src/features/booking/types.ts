export type BookingPostId = string;

export type BookingTabId = "day" | "month" | "new";

export type BookingEntry = {
  id: string;
  groupId: string;
  branchId: string;
  clientId: string | null;
  anonymous: boolean;
  client: string;
  phone: string;
  car: string;
  date: string;
  startTime: string;
  endTime: string;
  postId: BookingPostId;
  service: string;
  comment?: string;
  createdAt?: string;
  updatedAt?: string;
  createdByEmployeeId?: string | null;
};

export type BookingSlotSelection = {
  date: string;
  postId: BookingPostId;
  startTime: string;
  endTime: string;
  entry?: BookingEntry;
};

export type BookingDraftSegment = {
  id: string;
  postId: BookingPostId;
  postName: string;
  start: string;
  end: string;
};

export type BookingDraft = {
  date: string;
  clientId: string;
  note: string;
  segments: BookingDraftSegment[];
};

export type BookingPost = {
  id: BookingPostId;
  label: string;
};

export type BookingClientOption = {
  id: string;
  label: string;
};

export type BookingGroupView = {
  id: string;
  clientId: string | null;
  anonymous: boolean;
  isOnline?: boolean;
  client: string;
  phone: string;
  date: string;
  timeLabel: string;
  startTime: string;
  endTime: string;
  postLabel: string;
  comment: string;
};

export type DemoBookingStore = {
  entries: BookingEntry[];
};

export type MiniCalendarDay = {
  key: string;
  label: string;
  inCurrentMonth: boolean;
  isToday?: boolean;
  isSelected?: boolean;
};
