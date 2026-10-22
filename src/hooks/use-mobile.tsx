import * as React from "react";

// Il menu laterale desktop occupa 16rem: sui tablet (iPad compreso, fino a
// 1024px CSS) sottrae troppo spazio alle pipeline e rende comandi e colonne
// difficili da raggiungere. In questa fascia usiamo quindi il menu a
// scomparsa dei telefoni. I desktop ordinari restano invariati.
export const MOBILE_BREAKPOINT = 1025;

export function isMobileViewportWidth(width: number) {
  return width < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(isMobileViewportWidth(window.innerWidth));
    };
    mql.addEventListener("change", onChange);
    setIsMobile(isMobileViewportWidth(window.innerWidth));
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
