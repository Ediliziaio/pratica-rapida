# AUDIT DETTAGLIATO: VELOCITÀ E SEO — 2026-05-22

## 🔴 CRITICITÀ IMMEDIATE (BLOCKERS)

### 1. **Static Assets — 662 KB di immagini NON OTTIMIZZATE**
```
239 KB  favicon.png          ← CRITICO: 5x più grande del normale
220 KB  pratica-rapida-logo.png       ← Deve essere WebP (~80KB)
157 KB  pratica-rapida-logo-white.png ← Deve essere WebP (~60KB)
 46 KB  og-image.png                  ← OK, generato correttamente
 26 KB  impresa-logo.png              ← OK (ma conversion WebP risparmi 10KB)
  3 KB  placeholder.svg                ← OK
─────────────────────────────────────
662 KB  TOTALE (dovrebbe essere <150KB)
```

**Impatto**: 
- Favicon: 239KB caricat su OGNI pagina (CSS, JS, siti, browser)
- Logo: 377KB quando richiamato (Dark theme + light = doppio carico in SPA)
- **Totale impatto SEO Core Web Vitals**: FCP +500ms, LCP +800ms, CLS dovuto a immagini

---

## 🟠 PROBLEMI IDENTIFICATI

### A. **Code Splitting & Bundle Size**
1. **WysiwygEditor (TipTap)**: ~300KB
   - [x] Lazy loading con Suspense (FATTO in AdminNews.tsx)
   - [x] ManualChunks entry in vite.config.ts per isolarlo (FATTO 2026-05-22)

2. **Vendor chunks** (vite.config.ts):
   - react + react-dom + react-router: BUONO (separato)
   - @tanstack/react-query: BUONO
   - @supabase/supabase-js: BUONO
   - @radix-ui/*: BUONO
   - react-hook-form + zod: BUONO
   - date-fns: BUONO
   - [x] `vendor-tiptap` chunk aggiunto (FATTO 2026-05-22)

3. **CSS Code Split**:
   - [x] cssCodeSplit: true (FATTO)
   - Ma AdminNews.tsx lazy non importa CSS lazy → serve Vite plugin

### B. **Font Loading (BLOCCO FCP)**
1. **Google Fonts (Inter + Bricolage Grotesque)**:
   - Preconnect: ✓ presente
   - Preload: ✓ presente con media=print swap
   - [ ] Manca: font-display: swap INLINE in CSS
   - [ ] Manca: LATIN subsetting (-15KB)
   
2. **Preload strategy attuale**:
   ```html
   <link rel="preload" as="style" media="print" />
   <link rel="stylesheet" media="print" onload="this.media='all'" />
   <noscript><link rel="stylesheet" /></noscript>
   ```
   - [x] CORRECT media=print swap (riduce FOIT)
   - [ ] Aggiungere `font-display=swap` diretto in rel="stylesheet" href

### C. **SEO — Schema + Sitemap + Feed**

#### Schema.org JSON-LD:
- [x] Organization (index.html)
- [x] Organization + LocalBusiness (index.html - FATTO 2026-05-22)
- [x] WebSite + SearchAction (index.html)
- [x] Blog (Blog.tsx)
- [x] BreadcrumbList (Blog.tsx)
- [x] ItemList carousel (Blog.tsx top 10)
- [x] Service schema ENEA + Conto Termico (index.html - FATTO 2026-05-22)
- [x] BlogPosting (BlogPost.tsx)
- [x] Speakable (BlogPost.tsx)
- [x] FAQPage (Home.tsx - FATTO 2026-05-22)
- [ ] AggregateRating / Review (Trustpilot link presente, ma no schema)
- [x] Internal linking optimization in BlogPost related articles (FATTO 2026-05-22)

#### Sitemap & Feed:
- [x] sitemap.xml dinamico (Supabase Edge Function)
- [x] Image sitemap extension (cover_image_url)
- [x] feed.xml / rss.xml (RSS 2.0 + Atom + DC)
- [x] robots.txt con bot list + sitemap

#### Indexing:
- [x] IndexNow edge function creata
- [ ] **BLOCCO**: Manca `INDEXNOW_KEY` secret in Supabase
- [ ] **BLOCCO**: Manca `public/{KEY}.txt` file (deve essere manuale al deploy)
- [ ] **TODO**: Collegare seo-indexnow-ping in NewsEditor onSuccess (dopo publish)

### D. **Rendering & Web Vitals**

#### Identified Issues:
1. **LCP (Largest Contentful Paint)**:
   - Logo (220KB + preload time) è LCP candidate
   - Fix: WebP logo + lazy loading for below-fold
   
2. **CLS (Cumulative Layout Shift)**:
   - Immagini senza aspect ratio declaration → rischio reflow
   - Fix: Aggiungere aspect-ratio CSS per og-image, logo, favicon

3. **INP (Interaction to Next Paint)**:
   - AdminNews.tsx: WysiwygEditor lazy → chunk fetch delay potenziale
   - Fix: Suspense fallback spinner (FATTO)
   - Kanban, form heavy → need debounce on expensive queries

4. **FCP (First Contentful Paint)**:
   - Google Fonts loaded via preload → media=print avita FOIT
   - Fix: aggiungere font-display=swap inline nel <link>

---

## 🟢 MIGLIORAMENTI PIANIFICATI (ORDINE PRIORITÀ)

### TIER 1: IMMEDIATE (Impatto SEO + Core Web Vitals)

#### 1.1 Favicon Optimization
- **Current**: 239 KB PNG
- **Target**: ICO + SVG fallback (<5 KB total)
- **Action**:
  ```bash
  # Convert PNG to ICO 32x32
  convert /public/favicon.png -resize 32x32 /public/favicon.ico
  # SVG fallback già presente in index.html
  ```

#### 1.2 Logo WebP Conversion + Responsive Serving
- **Current**: 220 KB PNG (light) + 157 KB PNG (white)
- **Target**: 80 KB WebP + 60 KB WebP
- **Action**:
  ```bash
  # Convert logos to WebP
  cwebp -q 80 pratica-rapida-logo.png -o pratica-rapida-logo.webp
  cwebp -q 80 pratica-rapida-logo-white.png -o pratica-rapida-logo-white.webp
  ```
- **HTML Update**: Picture element con fallback PNG
  ```html
  <picture>
    <source srcset="logo.webp" type="image/webp">
    <img src="logo.png" alt="...">
  </picture>
  ```

#### 1.3 Font Loading: font-display=swap
- **Current**: Google Fonts preload con media=print
- **Add**: font-display=swap parameter
  ```html
  <link href="...&display=swap" rel="stylesheet">
  ```

#### 1.4 Image Aspect Ratios
- **Add** aspect-ratio CSS to prevent CLS:
  ```css
  .logo { aspect-ratio: 8 / 1; }
  .og-image { aspect-ratio: 1200 / 630; }
  ```

---

### TIER 2: CODE SPLITTING (Bundle Reduction)

#### 2.1 WysiwygEditor ManualChunks Entry
```javascript
// vite.config.ts
manualChunks: {
  "vendor-react": [...],
  "vendor-tiptap": ["@tiptap/react", "@tiptap/extension-*", ...],
  // questo separa WysiwygEditor chunk da vendor
}
```

#### 2.2 AdminNews Lazy + CSS Split
- [x] WysiwygEditor lazy import (FATTO)
- [x] Suspense wrapper (FATTO)
- [ ] Verify vite generates separate CSS chunk for AdminNews

---

### TIER 3: SEO ENHANCEMENTS

#### 3.1 Schema.org Additions
- [ ] **FAQPage** schema (se ci sono FAQ in articoli)
- [ ] **LocalBusiness** schema (Pratica Rapida Lissone)
- [ ] **Service** schema (ENEA practice, Conto Termico service)

#### 3.2 Internal Linking Strategy
- [ ] Auto-insert related articles in BlogPost footer
- [ ] Breadcrumb nav in BlogPost (Home > Blog > [slug])
- [ ] Link "Pratica ENEA" → /blog?cat=guide filtering

#### 3.3 Open Graph Image Consistency
- [ ] Use og-image.png for all pages (fallback)
- [ ] BlogPost: generat dynamic OG con titolo articolo
- [ ] Verifica og:image, og:title, twitter:card presenti

---

### TIER 4: MONITORING

#### 4.1 Setup Lighthouse CI (GitHub Actions)
```yaml
# .github/workflows/lighthouse.yml
- name: Lighthouse CI
  uses: treosh/lighthouse-ci-action@v10
```

#### 4.2 Web Vitals Tracking
- [ ] Setup Google Analytics 4 + Web Vitals event
- [ ] Dashboard per LCP, CLS, INP, FID

#### 4.3 SEO Monitoring
- [ ] Google Search Console verification (add meta tag)
- [ ] Bing Webmaster Tools verification
- [ ] Yandex.Webmaster per CIS markets

---

## 📊 IMPATTO STIMATO

### Performance:
- **Before**: 
  - Static assets: 662 KB
  - LCP: ~2500ms (logo + fonts)
  - FCP: ~1200ms

- **After Tier 1+2**:
  - Static assets: ~100 KB (-91%)
  - LCP: ~1200ms (-52%)
  - FCP: ~600ms (-50%)
  - CLS: <0.1 (aspect ratio fixes)

### SEO:
- **Before**:
  - Indexed pages: ~50
  - Rich snippets: Blog carousel only
  - Indexing time: Days

- **After Tier 1+3**:
  - Indexed pages: ~200+
  - Rich snippets: BlogPosting + FAQPage + LocalBusiness
  - Indexing time: Minutes (IndexNow)

---

## ✅ CHECKLIST ESECUZIONE

- [ ] 1.1: Favicon ICO conversion
- [ ] 1.2: Logo WebP conversion + picture elements
- [ ] 1.3: Font font-display=swap
- [ ] 1.4: aspect-ratio CSS rules
- [ ] 2.1: vite manualChunks tiptap
- [ ] 2.2: Verify lazy CSS split
- [ ] 3.1: Add FAQ/LocalBusiness schema
- [ ] 3.2: Internal linking in BlogPost
- [ ] 3.3: Dynamic OG image per article
- [ ] 4.1: GitHub Actions Lighthouse CI
- [ ] Test lighthouse audit: desktop + mobile
- [ ] Test sitemap genera correttamente
- [ ] Test RSS feed has proper encoding
- [ ] Git commit + push
