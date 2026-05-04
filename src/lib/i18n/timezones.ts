export interface TimezoneOption {
  value: string;
  label: string;
}

export interface TimezoneGroup {
  group: string;
  options: TimezoneOption[];
}

export const TIMEZONE_GROUPS: TimezoneGroup[] = [
  {
    group: "UTC",
    options: [{ value: "UTC", label: "UTC" }],
  },
  {
    group: "Europe",
    options: [
      { value: "Europe/London", label: "London (GMT/BST)" },
      { value: "Europe/Dublin", label: "Dublin (GMT/IST)" },
      { value: "Europe/Lisbon", label: "Lisbon (WET/WEST)" },
      { value: "Europe/Paris", label: "Paris (CET/CEST)" },
      { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
      { value: "Europe/Amsterdam", label: "Amsterdam (CET/CEST)" },
      { value: "Europe/Brussels", label: "Brussels (CET/CEST)" },
      { value: "Europe/Madrid", label: "Madrid (CET/CEST)" },
      { value: "Europe/Rome", label: "Rome (CET/CEST)" },
      { value: "Europe/Stockholm", label: "Stockholm (CET/CEST)" },
      { value: "Europe/Warsaw", label: "Warsaw (CET/CEST)" },
      { value: "Europe/Prague", label: "Prague (CET/CEST)" },
      { value: "Europe/Vienna", label: "Vienna (CET/CEST)" },
      { value: "Europe/Zurich", label: "Zurich (CET/CEST)" },
      { value: "Europe/Helsinki", label: "Helsinki (EET/EEST)" },
      { value: "Europe/Athens", label: "Athens (EET/EEST)" },
      { value: "Europe/Bucharest", label: "Bucharest (EET/EEST)" },
      { value: "Europe/Kiev", label: "Kyiv (EET/EEST)" },
      { value: "Europe/Moscow", label: "Moscow (MSK)" },
    ],
  },
  {
    group: "Americas",
    options: [
      { value: "America/New_York", label: "New York (ET)" },
      { value: "America/Chicago", label: "Chicago (CT)" },
      { value: "America/Denver", label: "Denver (MT)" },
      { value: "America/Los_Angeles", label: "Los Angeles (PT)" },
      { value: "America/Toronto", label: "Toronto (ET)" },
      { value: "America/Vancouver", label: "Vancouver (PT)" },
      { value: "America/Mexico_City", label: "Mexico City (CT)" },
      { value: "America/Sao_Paulo", label: "São Paulo (BRT)" },
    ],
  },
  {
    group: "Middle East & Africa",
    options: [
      { value: "Asia/Dubai", label: "Dubai (GST)" },
      { value: "Asia/Riyadh", label: "Riyadh (AST)" },
      { value: "Africa/Johannesburg", label: "Johannesburg (SAST)" },
      { value: "Africa/Lagos", label: "Lagos (WAT)" },
      { value: "Africa/Nairobi", label: "Nairobi (EAT)" },
    ],
  },
  {
    group: "Asia Pacific",
    options: [
      { value: "Asia/Singapore", label: "Singapore (SGT)" },
      { value: "Asia/Hong_Kong", label: "Hong Kong (HKT)" },
      { value: "Asia/Tokyo", label: "Tokyo (JST)" },
      { value: "Asia/Seoul", label: "Seoul (KST)" },
      { value: "Asia/Shanghai", label: "Shanghai (CST)" },
      { value: "Asia/Kolkata", label: "Mumbai / Kolkata (IST)" },
      { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
      { value: "Pacific/Auckland", label: "Auckland (NZST/NZDT)" },
    ],
  },
];

export const ALL_TIMEZONES: TimezoneOption[] = TIMEZONE_GROUPS.flatMap((g) => g.options);
