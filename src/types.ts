export type Weapon = {
  id: string;
  label: string;
  base: boolean;
  createdAt: string | null;
};

export type Entry = {
  date: string;
  time?: string;
  weaponId: string;
  weapon?: string;
  kpm: number;
};

export type PlayerData = {
  username: string;
  displayName?: string;
  createdAt?: string;
  updatedAt?: string;
  weapons: Weapon[];
  entries: Entry[];
};

export type Session = {
  token: string;
  user: PlayerData;
  expiresAt: string;
};

export type ChartMode = "all" | "global";
export type RangeKey = "week" | "fifteen" | "month" | "twoMonths" | "threeMonths";
