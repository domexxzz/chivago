type IconName =
  | "arrow"
  | "pin"
  | "calendar"
  | "people"
  | "star"
  | "clock"
  | "leaf"
  | "menu"
  | "close";
const paths: Record<IconName, string> = {
  arrow: "M4 12h15m-6-6 6 6-6 6",
  pin: "M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0ZM12 6v6m-3-3h6",
  calendar: "M5 5h14v15H5ZM8 3v4m8-4v4M5 10h14",
  people:
    "M16 21v-3a4 4 0 0 0-8 0v3m4-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m7 1a3 3 0 0 1 3 3v4M19 3a4 4 0 0 1 0 8",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
  clock: "M12 8v5l3 2m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  leaf: "M5 19c-5-10 4-15 15-15 0 11-5 20-15 15Zm0 0 10-10",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M18 6 6 18",
};
export default function Icon({
  name,
  size = 20,
}: {
  name: IconName;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
