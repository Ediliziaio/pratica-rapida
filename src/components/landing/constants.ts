export const PR_GREEN = "#00843D";

export type NavLink = {
  href: string;
  label: string;
  children?: { href: string; label: string }[];
};

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/pratica-enea", label: "Pratiche ENEA" },
  {
    href: "/conto-termico",
    label: "Conto Termico",
    children: [
      { href: "/conto-termico", label: "Cosa facciamo" },
      { href: "/conto-termico/guida", label: "Guida al CT 3.0" },
      { href: "/conto-termico/simulatore", label: "Simulatore" },
    ],
  },
  { href: "/faq", label: "FAQ" },
  { href: "/blog", label: "Notizie" },
];
