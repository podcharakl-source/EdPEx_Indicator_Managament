export interface YearlyData {
  year: string;
  target?: number | string;
  actual?: number | string;
  value?: number | string; // Keeping for compatibility
}

export type InputType = 'yearly' | 'none';

export interface University {
  id: string;
  name: string;
  abbreviation: string;
  isDefault?: boolean;
  color?: string;
}

export interface ComparisonUniversityData {
  id: string;
  name: string;
  abbreviation: string;
  records: YearlyData[];
  color?: string;
}

export interface ResultItemData {
  type: InputType;
  unit: string;
  records: YearlyData[]; // Default/Current University records
  comparisonUniversities?: ComparisonUniversityData[];
  mainColor?: string;
  targetColor?: string;
}

export interface EdPExItem {
  result_id: string;
  group_id: string;
  sub_group_char: string;
  sub_sub_group_num: string;
  item_num: string;
  index: string;
  group_title: string;
  sub_group_title: string;
  sub_sub_group_title: string;
  result_title: string;
  data?: ResultItemData;
}

export interface GroupData {
  id: string;
  title: string;
  subGroups: {
    [char: string]: {
      title: string;
      subSubGroups: {
        [num: string]: {
          title: string;
          items: EdPExItem[];
        };
      };
    };
  };
}

export type UserRole = 'admin' | 'staff' | 'guest' | 'pending';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  displayName?: string;
}

export interface ActivityLog {
  id?: string;
  userId: string;
  userEmail: string;
  action: string;
  details: string;
  timestamp: any; // Firestore Timestamp
}
