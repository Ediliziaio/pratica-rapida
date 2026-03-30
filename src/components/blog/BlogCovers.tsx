// Custom SVG cover illustrations for each blog article.
// Each component fills its container (100% width/height).

export function CoverEcobonus2026() {
  return (
    <svg viewBox="0 0 400 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="400" height="220" fill="#1a1206" />
      {/* Dot grid */}
      <pattern id="dots-eco" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.06)" />
      </pattern>
      <rect width="400" height="220" fill="url(#dots-eco)" />

      {/* Building silhouette */}
      <rect x="60" y="80" width="90" height="110" rx="3" fill="#2a1f0a" stroke="rgba(255,180,50,0.2)" strokeWidth="1" />
      {/* Windows on building */}
      {[0,1,2].map(row => [0,1].map(col => (
        <rect key={`w${row}${col}`} x={75 + col * 30} y={90 + row * 28} width="18" height="18" rx="2"
          fill={row === 0 && col === 1 ? "rgba(255,180,50,0.35)" : "rgba(255,180,50,0.1)"}
          stroke="rgba(255,180,50,0.3)" strokeWidth="0.8" />
      )))}
      {/* Door */}
      <rect x="88" y="162" width="14" height="28" rx="2" fill="rgba(255,140,30,0.2)" stroke="rgba(255,180,50,0.3)" strokeWidth="0.8" />
      {/* Roof */}
      <polygon points="55,80 150,80 105,50" fill="#2d2008" stroke="rgba(255,180,50,0.25)" strokeWidth="1" />

      {/* Insulation layer on building */}
      <rect x="150" y="80" width="8" height="110" fill="rgba(255,150,30,0.15)" stroke="rgba(255,150,30,0.4)" strokeWidth="0.8" strokeDasharray="3 2" />
      {/* Arrows indicating heat loss */}
      {[95, 120, 145].map((y, i) => (
        <g key={i}>
          <line x1="158" y1={y} x2="175" y2={y} stroke={i === 1 ? "rgba(255,100,50,0.7)" : "rgba(255,100,50,0.3)"} strokeWidth={i === 1 ? "1.5" : "1"} />
          <polygon points={`175,${y-3} 181,${y} 175,${y+3}`} fill={i === 1 ? "rgba(255,100,50,0.7)" : "rgba(255,100,50,0.3)"} />
        </g>
      ))}

      {/* Old percentage — crossed out */}
      <g opacity="0.6">
        <text x="205" y="115" fontSize="44" fontWeight="800" fill="#d97706" fontFamily="system-ui, sans-serif" opacity="0.5">50%</text>
        <line x1="202" y1="95" x2="268" y2="120" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
      </g>

      {/* New percentage — highlighted */}
      <text x="210" y="165" fontSize="48" fontWeight="900" fill="#f59e0b" fontFamily="system-ui, sans-serif">36%</text>
      {/* Badge under new % */}
      <rect x="208" y="172" width="80" height="18" rx="9" fill="rgba(245,158,11,0.18)" stroke="rgba(245,158,11,0.4)" strokeWidth="0.8" />
      <text x="248" y="184" fontSize="9" fontWeight="700" fill="#fbbf24" textAnchor="middle" fontFamily="system-ui, sans-serif">DAL 2026</text>

      {/* Arrow down between percentages */}
      <line x1="242" y1="122" x2="242" y2="140" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3 2" />
      <polygon points="238,140 242,148 246,140" fill="#f59e0b" />

      {/* Legge di Bilancio scroll */}
      <rect x="310" y="70" width="70" height="90" rx="4" fill="#1e1a0e" stroke="rgba(245,158,11,0.25)" strokeWidth="1" />
      <rect x="310" y="70" width="70" height="14" rx="4" fill="rgba(245,158,11,0.15)" />
      {[0,1,2,3,4].map(i => (
        <line key={i} x1="320" y1={92 + i * 12} x2="370" y2={92 + i * 12} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      ))}
      <text x="345" y="79" fontSize="7" fontWeight="700" fill="#fbbf24" textAnchor="middle" fontFamily="system-ui, sans-serif">L. 207/2024</text>

      {/* Label */}
      <rect x="22" y="192" width="120" height="18" rx="9" fill="rgba(245,158,11,0.12)" stroke="rgba(245,158,11,0.3)" strokeWidth="0.8" />
      <text x="82" y="204" fontSize="8" fontWeight="700" fill="#fbbf24" textAnchor="middle" fontFamily="system-ui, sans-serif">LEGGE DI BILANCIO 2025</text>
    </svg>
  );
}

export function CoverEneaSerramenti() {
  return (
    <svg viewBox="0 0 400 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="400" height="220" fill="#091a10" />
      <pattern id="dots-enea" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.05)" />
      </pattern>
      <rect width="400" height="220" fill="url(#dots-enea)" />

      {/* Large window frame */}
      <rect x="90" y="35" width="160" height="150" rx="4" fill="#0e2518" stroke="rgba(0,200,100,0.35)" strokeWidth="2" />
      {/* Inner frame dividers */}
      <line x1="172" y1="35" x2="172" y2="185" stroke="rgba(0,200,100,0.25)" strokeWidth="2" />
      <line x1="90" y1="110" x2="250" y2="110" stroke="rgba(0,200,100,0.25)" strokeWidth="2" />
      {/* Glass panes — tinted */}
      <rect x="95" y="40" width="73" height="66" rx="2" fill="rgba(0,200,150,0.07)" />
      <rect x="177" y="40" width="68" height="66" rx="2" fill="rgba(0,200,150,0.07)" />
      <rect x="95" y="115" width="73" height="65" rx="2" fill="rgba(0,200,150,0.07)" />
      <rect x="177" y="115" width="68" height="65" rx="2" fill="rgba(0,200,150,0.07)" />

      {/* Thermal transmission arrows — going outward */}
      {[55, 85, 120, 150].map((y, i) => (
        <g key={i} opacity={i % 2 === 0 ? 0.8 : 0.4}>
          <line x1="255" y1={y} x2="280" y2={y} stroke="#22c55e" strokeWidth="1.2" strokeDasharray="3 2" />
          <polygon points={`280,${y-2.5} 285,${y} 280,${y+2.5}`} fill="#22c55e" />
        </g>
      ))}
      <text x="290" y="108" fontSize="8" fill="rgba(34,197,94,0.6)" fontFamily="system-ui, sans-serif">perdita</text>
      <text x="290" y="118" fontSize="8" fill="rgba(34,197,94,0.6)" fontFamily="system-ui, sans-serif">termica</text>

      {/* Uw value badge */}
      <rect x="130" y="68" width="82" height="30" rx="8" fill="rgba(0,200,100,0.15)" stroke="rgba(0,200,100,0.5)" strokeWidth="1" />
      <text x="171" y="80" fontSize="8" fontWeight="700" fill="#4ade80" textAnchor="middle" fontFamily="system-ui, sans-serif">Uw CERTIFICATO</text>
      <text x="171" y="92" fontSize="11" fontWeight="900" fill="#22c55e" textAnchor="middle" fontFamily="system-ui, sans-serif">≤ 1,40 W/m²K</text>

      {/* Zone climatica indicator */}
      <rect x="25" y="70" width="55" height="60" rx="6" fill="#0e2010" stroke="rgba(0,200,100,0.2)" strokeWidth="1" />
      <text x="52" y="86" fontSize="7" fontWeight="700" fill="rgba(74,222,128,0.7)" textAnchor="middle" fontFamily="system-ui, sans-serif">ZONA</text>
      <text x="52" y="100" fontSize="22" fontWeight="900" fill="#4ade80" textAnchor="middle" fontFamily="system-ui, sans-serif">E</text>
      <text x="52" y="114" fontSize="7" fill="rgba(74,222,128,0.5)" textAnchor="middle" fontFamily="system-ui, sans-serif">climatica</text>

      {/* 90-day timer */}
      <circle cx="330" cy="90" r="32" fill="#0e2010" stroke="rgba(0,200,100,0.3)" strokeWidth="1.5" />
      <circle cx="330" cy="90" r="32" fill="none" stroke="rgba(34,197,94,0.6)" strokeWidth="2.5"
        strokeDasharray="140 62" strokeDashoffset="35" strokeLinecap="round" />
      <text x="330" y="85" fontSize="18" fontWeight="900" fill="#22c55e" textAnchor="middle" fontFamily="system-ui, sans-serif">90</text>
      <text x="330" y="97" fontSize="8" fontWeight="600" fill="rgba(74,222,128,0.7)" textAnchor="middle" fontFamily="system-ui, sans-serif">GIORNI</text>

      {/* Label */}
      <rect x="22" y="192" width="100" height="18" rx="9" fill="rgba(34,197,94,0.12)" stroke="rgba(34,197,94,0.3)" strokeWidth="0.8" />
      <text x="72" y="204" fontSize="8" fontWeight="700" fill="#4ade80" textAnchor="middle" fontFamily="system-ui, sans-serif">PRATICA ENEA 2026</text>
    </svg>
  );
}

export function CoverContoTermico() {
  return (
    <svg viewBox="0 0 400 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="400" height="220" fill="#06111a" />
      <pattern id="dots-ct" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.05)" />
      </pattern>
      <rect width="400" height="220" fill="url(#dots-ct)" />

      {/* House silhouette */}
      <polygon points="70,115 130,75 190,115" fill="#0d2233" stroke="rgba(56,189,248,0.3)" strokeWidth="1.5" />
      <rect x="75" y="115" width="110" height="65" fill="#0d2233" stroke="rgba(56,189,248,0.25)" strokeWidth="1.2" />
      <rect x="105" y="140" width="20" height="40" rx="2" fill="rgba(56,189,248,0.12)" stroke="rgba(56,189,248,0.3)" strokeWidth="0.8" />
      {/* Windows on house */}
      <rect x="83" y="122" width="20" height="16" rx="2" fill="rgba(56,189,248,0.15)" stroke="rgba(56,189,248,0.4)" strokeWidth="0.8" />
      <rect x="155" y="122" width="20" height="16" rx="2" fill="rgba(56,189,248,0.35)" stroke="rgba(56,189,248,0.5)" strokeWidth="0.8" />

      {/* Heat pump unit */}
      <rect x="220" y="95" width="75" height="85" rx="6" fill="#0a1e2e" stroke="rgba(56,189,248,0.4)" strokeWidth="1.5" />
      <circle cx="257" cy="137" r="24" fill="none" stroke="rgba(56,189,248,0.25)" strokeWidth="1" />
      <circle cx="257" cy="137" r="18" fill="rgba(56,189,248,0.08)" stroke="rgba(56,189,248,0.4)" strokeWidth="1" />
      {/* Fan blades */}
      {[0, 60, 120, 180, 240, 300].map((deg, i) => (
        <line key={i}
          x1={257 + Math.cos(deg * Math.PI / 180) * 4}
          y1={137 + Math.sin(deg * Math.PI / 180) * 4}
          x2={257 + Math.cos(deg * Math.PI / 180) * 16}
          y2={137 + Math.sin(deg * Math.PI / 180) * 16}
          stroke="rgba(56,189,248,0.5)" strokeWidth="1.5" strokeLinecap="round" />
      ))}
      <circle cx="257" cy="137" r="3" fill="rgba(56,189,248,0.7)" />
      {/* Model label on pump */}
      <text x="257" y="172" fontSize="7" fontWeight="700" fill="rgba(56,189,248,0.5)" textAnchor="middle" fontFamily="system-ui, sans-serif">HEAT PUMP</text>

      {/* Connection pipes */}
      <path d="M190 140 Q205 140 220 137" stroke="rgba(56,189,248,0.4)" strokeWidth="2" strokeDasharray="4 2" fill="none" />
      <path d="M190 155 Q205 155 220 158" stroke="rgba(239,68,68,0.4)" strokeWidth="2" strokeDasharray="4 2" fill="none" />
      {/* Hot/cold labels */}
      <text x="197" y="138" fontSize="6" fill="rgba(56,189,248,0.5)" fontFamily="system-ui, sans-serif">freddo</text>
      <text x="197" y="168" fontSize="6" fill="rgba(239,68,68,0.5)" fontFamily="system-ui, sans-serif">caldo</text>

      {/* GSE contribution badge */}
      <rect x="30" y="30" width="100" height="38" rx="8" fill="rgba(56,189,248,0.1)" stroke="rgba(56,189,248,0.35)" strokeWidth="1" />
      <text x="80" y="44" fontSize="7" fontWeight="700" fill="rgba(147,210,240,0.8)" textAnchor="middle" fontFamily="system-ui, sans-serif">CONTRIBUTO GSE</text>
      <text x="80" y="60" fontSize="16" fontWeight="900" fill="#38bdf8" textAnchor="middle" fontFamily="system-ui, sans-serif">€ 3.500</text>

      {/* Contribution bars */}
      {[
        { label: "Anno 1", w: 80, y: 85 },
        { label: "Anno 2", w: 80, y: 100 },
      ].map((bar) => (
        <g key={bar.label}>
          <text x="32" y={bar.y + 9} fontSize="7" fill="rgba(56,189,248,0.5)" fontFamily="system-ui, sans-serif">{bar.label}</text>
          <rect x="65" y={bar.y} width="100" height="10" rx="5" fill="rgba(56,189,248,0.08)" />
          <rect x="65" y={bar.y} width={bar.w} height="10" rx="5" fill="rgba(56,189,248,0.4)" />
        </g>
      ))}

      {/* Label */}
      <rect x="22" y="192" width="110" height="18" rx="9" fill="rgba(56,189,248,0.1)" stroke="rgba(56,189,248,0.3)" strokeWidth="0.8" />
      <text x="77" y="204" fontSize="8" fontWeight="700" fill="#38bdf8" textAnchor="middle" fontFamily="system-ui, sans-serif">CONTO TERMICO GSE 2026</text>
    </svg>
  );
}

export function CoverErroriEnea() {
  return (
    <svg viewBox="0 0 400 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="400" height="220" fill="#180a0a" />
      <pattern id="dots-err" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.05)" />
      </pattern>
      <rect width="400" height="220" fill="url(#dots-err)" />

      {/* Document */}
      <rect x="70" y="30" width="130" height="160" rx="6" fill="#1c0e0e" stroke="rgba(239,68,68,0.3)" strokeWidth="1.5" />
      {/* Document header */}
      <rect x="70" y="30" width="130" height="22" rx="6" fill="rgba(239,68,68,0.15)" />
      <text x="135" y="45" fontSize="8" fontWeight="700" fill="rgba(239,68,68,0.8)" textAnchor="middle" fontFamily="system-ui, sans-serif">PRATICA ENEA</text>

      {/* Checklist items */}
      {[
        { y: 65, ok: false, text: "Data fine lavori" },
        { y: 92, ok: false, text: "Scheda tecnica" },
        { y: 119, ok: true, text: "Dati catastali" },
        { y: 146, ok: false, text: "Intestazione" },
        { y: 173, ok: true, text: "Fattura allegata" },
      ].map((item, i) => (
        <g key={i}>
          <rect x="85" y={item.y - 10} width="16" height="16" rx="4"
            fill={item.ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}
            stroke={item.ok ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)"} strokeWidth="1" />
          {item.ok ? (
            <path d={`M89,${item.y - 3} L93,${item.y + 1} L99,${item.y - 6}`}
              stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ) : (
            <>
              <line x1="89" y1={item.y - 7} x2="97" y2={item.y + 1} stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="97" y1={item.y - 7} x2="89" y2={item.y + 1} stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" />
            </>
          )}
          <text x="109" y={item.y + 2} fontSize="8.5" fill={item.ok ? "rgba(134,239,172,0.7)" : "rgba(252,165,165,0.7)"}
            fontFamily="system-ui, sans-serif">{item.text}</text>
        </g>
      ))}

      {/* Big warning triangle */}
      <polygon points="295,50 360,160 230,160" fill="rgba(239,68,68,0.08)" stroke="rgba(239,68,68,0.4)" strokeWidth="2" />
      <text x="295" y="130" fontSize="50" textAnchor="middle" fill="rgba(239,68,68,0.7)" fontFamily="system-ui, sans-serif">!</text>
      <line x1="295" y1="95" x2="295" y2="120" stroke="rgba(239,68,68,0.8)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="295" cy="134" r="3.5" fill="rgba(239,68,68,0.8)" />

      {/* Counter */}
      <rect x="230" y="165" width="130" height="22" rx="8" fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.3)" strokeWidth="0.8" />
      <text x="295" y="179" fontSize="9" fontWeight="700" fill="rgba(252,165,165,0.8)" textAnchor="middle" fontFamily="system-ui, sans-serif">3 errori su 5 evitabili</text>

      {/* Label */}
      <rect x="22" y="192" width="100" height="18" rx="9" fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.3)" strokeWidth="0.8" />
      <text x="72" y="204" fontSize="8" fontWeight="700" fill="#fca5a5" textAnchor="middle" fontFamily="system-ui, sans-serif">ERRORI DA EVITARE</text>
    </svg>
  );
}

export function CoverScadenza90() {
  return (
    <svg viewBox="0 0 400 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="400" height="220" fill="#111108" />
      <pattern id="dots-sc" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.05)" />
      </pattern>
      <rect width="400" height="220" fill="url(#dots-sc)" />

      {/* Large circular countdown */}
      <circle cx="150" cy="115" r="80" fill="#1a1800" stroke="rgba(234,179,8,0.12)" strokeWidth="1" />
      <circle cx="150" cy="115" r="80" fill="none" stroke="rgba(234,179,8,0.15)" strokeWidth="8" />
      {/* Progress arc ~75% done */}
      <circle cx="150" cy="115" r="80" fill="none" stroke="#eab308" strokeWidth="8"
        strokeDasharray="378 125" strokeDashoffset="94" strokeLinecap="round"
        style={{ transform: "rotate(-90deg)", transformOrigin: "150px 115px" }} />
      {/* Tick marks */}
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i * 30 - 90) * Math.PI / 180;
        const r1 = 70, r2 = 76;
        return (
          <line key={i}
            x1={150 + Math.cos(angle) * r1} y1={115 + Math.sin(angle) * r1}
            x2={150 + Math.cos(angle) * r2} y2={115 + Math.sin(angle) * r2}
            stroke="rgba(234,179,8,0.3)" strokeWidth="1.5" />
        );
      })}
      {/* Big "90" */}
      <text x="150" y="104" fontSize="46" fontWeight="900" fill="#eab308" textAnchor="middle" fontFamily="system-ui, sans-serif">90</text>
      <text x="150" y="124" fontSize="13" fontWeight="700" fill="rgba(234,179,8,0.7)" textAnchor="middle" fontFamily="system-ui, sans-serif">GIORNI</text>
      <text x="150" y="140" fontSize="8" fill="rgba(234,179,8,0.45)" textAnchor="middle" fontFamily="system-ui, sans-serif">dalla fine lavori</text>

      {/* Calendar grid */}
      <rect x="270" y="40" width="110" height="110" rx="8" fill="#1a1800" stroke="rgba(234,179,8,0.25)" strokeWidth="1" />
      <rect x="270" y="40" width="110" height="20" rx="8" fill="rgba(234,179,8,0.18)" />
      <text x="325" y="54" fontSize="8" fontWeight="700" fill="#fbbf24" textAnchor="middle" fontFamily="system-ui, sans-serif">SCADENZA</text>
      {/* Calendar rows */}
      {Array.from({ length: 4 }, (_, row) =>
        Array.from({ length: 7 }, (_, col) => {
          const day = row * 7 + col + 1;
          const isLast = day === 27;
          const isPast = day < 20;
          return day <= 28 ? (
            <rect key={`${row}${col}`}
              x={275 + col * 14} y={65 + row * 14}
              width="12" height="12" rx="2"
              fill={isLast ? "#eab308" : isPast ? "rgba(234,179,8,0.2)" : "rgba(234,179,8,0.06)"}
              stroke={isLast ? "none" : "rgba(234,179,8,0.1)"} strokeWidth="0.5" />
          ) : null;
        })
      )}
      {/* X on last day */}
      <text x="282" y="136" fontSize="6" fontWeight="900" fill="#1a1800" textAnchor="middle" fontFamily="system-ui, sans-serif">27</text>

      {/* Alert below calendar */}
      <rect x="270" y="158" width="110" height="28" rx="6" fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.35)" strokeWidth="1" />
      <text x="325" y="169" fontSize="8" fontWeight="700" fill="#fca5a5" textAnchor="middle" fontFamily="system-ui, sans-serif">SCADENZA TASSATIVA</text>
      <text x="325" y="180" fontSize="7" fill="rgba(252,165,165,0.6)" textAnchor="middle" fontFamily="system-ui, sans-serif">nessuna proroga possibile</text>

      {/* Label */}
      <rect x="22" y="192" width="95" height="18" rx="9" fill="rgba(234,179,8,0.1)" stroke="rgba(234,179,8,0.3)" strokeWidth="0.8" />
      <text x="69" y="204" fontSize="8" fontWeight="700" fill="#fbbf24" textAnchor="middle" fontFamily="system-ui, sans-serif">SCADENZA 90 GIORNI</text>
    </svg>
  );
}

export function CoverOutsourcing() {
  return (
    <svg viewBox="0 0 400 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="400" height="220" fill="#0d0a18" />
      <pattern id="dots-out" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.05)" />
      </pattern>
      <rect width="400" height="220" fill="url(#dots-out)" />

      {/* Installatore (left) */}
      <circle cx="80" cy="95" r="28" fill="#130e24" stroke="rgba(167,139,250,0.35)" strokeWidth="1.5" />
      {/* Person icon */}
      <circle cx="80" cy="84" r="9" fill="rgba(167,139,250,0.25)" stroke="rgba(167,139,250,0.5)" strokeWidth="1" />
      <path d="M61,110 Q61,98 80,98 Q99,98 99,110" fill="rgba(167,139,250,0.2)" stroke="rgba(167,139,250,0.4)" strokeWidth="1" />
      <text x="80" y="136" fontSize="8" fontWeight="600" fill="rgba(167,139,250,0.7)" textAnchor="middle" fontFamily="system-ui, sans-serif">Installatore</text>

      {/* Document flow arrows with documents */}
      {[0, 1, 2].map((i) => {
        const y = 70 + i * 26;
        return (
          <g key={i}>
            {/* Document icon */}
            <rect x="135" y={y - 10} width="18" height="22" rx="2" fill="rgba(167,139,250,0.1)" stroke="rgba(167,139,250,0.35)" strokeWidth="0.8" />
            <line x1="139" y1={y - 4} x2="149" y2={y - 4} stroke="rgba(167,139,250,0.3)" strokeWidth="0.8" />
            <line x1="139" y1={y + 1} x2="149" y2={y + 1} stroke="rgba(167,139,250,0.3)" strokeWidth="0.8" />
            <line x1="139" y1={y + 6} x2="145" y2={y + 6} stroke="rgba(167,139,250,0.3)" strokeWidth="0.8" />
            {/* Arrow */}
            <line x1="158" y1={y + 1} x2="180" y2={y + 1} stroke="rgba(167,139,250,0.5)" strokeWidth="1.2" />
            <polygon points={`180,${y - 2} 186,${y + 1} 180,${y + 4}`} fill="rgba(167,139,250,0.5)" />
          </g>
        );
      })}

      {/* Pratica Rapida (center hub) */}
      <circle cx="240" cy="95" r="36" fill="#140e24" stroke="rgba(167,139,250,0.5)" strokeWidth="2" />
      {/* PR logo-like */}
      <text x="240" y="88" fontSize="11" fontWeight="900" fill="#a78bfa" textAnchor="middle" fontFamily="system-ui, sans-serif">PRATICA</text>
      <text x="240" y="102" fontSize="11" fontWeight="900" fill="#a78bfa" textAnchor="middle" fontFamily="system-ui, sans-serif">RAPIDA</text>
      {/* Pulse ring */}
      <circle cx="240" cy="95" r="44" fill="none" stroke="rgba(167,139,250,0.15)" strokeWidth="1.5" strokeDasharray="5 3" />

      {/* Arrows from hub to ENEA and GSE */}
      <line x1="274" y1="72" x2="310" y2="48" stroke="rgba(34,197,94,0.5)" strokeWidth="1.5" />
      <polygon points="306,44 316,46 310,54" fill="rgba(34,197,94,0.5)" />

      <line x1="274" y1="118" x2="310" y2="145" stroke="rgba(56,189,248,0.5)" strokeWidth="1.5" />
      <polygon points="306,150 316,147 312,139" fill="rgba(56,189,248,0.5)" />

      {/* ENEA badge */}
      <rect x="315" y="28" width="65" height="30" rx="6" fill="rgba(34,197,94,0.12)" stroke="rgba(34,197,94,0.4)" strokeWidth="1" />
      <text x="347" y="40" fontSize="9" fontWeight="800" fill="#4ade80" textAnchor="middle" fontFamily="system-ui, sans-serif">ENEA</text>
      <text x="347" y="52" fontSize="7" fill="rgba(74,222,128,0.6)" textAnchor="middle" fontFamily="system-ui, sans-serif">24h ✓</text>

      {/* GSE badge */}
      <rect x="315" y="133" width="65" height="30" rx="6" fill="rgba(56,189,248,0.12)" stroke="rgba(56,189,248,0.4)" strokeWidth="1" />
      <text x="347" y="145" fontSize="9" fontWeight="800" fill="#38bdf8" textAnchor="middle" fontFamily="system-ui, sans-serif">GSE</text>
      <text x="347" y="157" fontSize="7" fill="rgba(147,210,240,0.6)" textAnchor="middle" fontFamily="system-ui, sans-serif">72h ✓</text>

      {/* Cost comparison */}
      <rect x="20" y="160" width="175" height="40" rx="8" fill="rgba(167,139,250,0.08)" stroke="rgba(167,139,250,0.2)" strokeWidth="1" />
      <text x="107" y="175" fontSize="7" fontWeight="700" fill="rgba(167,139,250,0.6)" textAnchor="middle" fontFamily="system-ui, sans-serif">GESTIONE INTERNA</text>
      <text x="107" y="189" fontSize="8" fill="rgba(167,139,250,0.5)" textAnchor="middle" fontFamily="system-ui, sans-serif">~750€/mese  →  <tspan fill="#a78bfa" fontWeight="700">650€ con PR</tspan></text>

      {/* Label */}
      <rect x="22" y="192" width="90" height="18" rx="9" fill="rgba(167,139,250,0.1)" stroke="rgba(167,139,250,0.3)" strokeWidth="0.8" />
      <text x="67" y="204" fontSize="8" fontWeight="700" fill="#c4b5fd" textAnchor="middle" fontFamily="system-ui, sans-serif">OUTSOURCING 2026</text>
    </svg>
  );
}

export const BLOG_COVER_MAP: Record<string, React.ComponentType> = {
  "ecobonus-2026-nuove-aliquote-serramenti": CoverEcobonus2026,
  "pratica-enea-serramenti-guida-2026": CoverEneaSerramenti,
  "conto-termico-2026-guida-completa": CoverContoTermico,
  "errori-pratiche-enea-da-evitare-2026": CoverErroriEnea,
  "scadenza-90-giorni-enea-ct-2026": CoverScadenza90,
  "outsourcing-pratiche-enea-installatori-2026": CoverOutsourcing,
};
