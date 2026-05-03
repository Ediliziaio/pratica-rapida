import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { useScrollAnimation } from "../landing/hooks";
import { ArrowRight, Calendar, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

export interface HomepageNews {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  badge: string;
  badgeColor: string;
  link?: string;
  published: boolean;
}

const DEFAULT_NEWS: HomepageNews[] = [];

export function useHomepageNews() {
  return useQuery<HomepageNews[]>({
    queryKey: ["homepage_news"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "homepage_news")
        .single();
      return (data?.value as HomepageNews[]) ?? DEFAULT_NEWS;
    },
    staleTime: 5 * 60 * 1000,
  });
}

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  green:  { bg: "hsla(152,100%,42%,0.12)", text: "hsl(152 100% 32%)" },
  orange: { bg: "hsla(25,95%,53%,0.12)",   text: "hsl(25 95% 45%)"   },
  blue:   { bg: "hsla(214,100%,60%,0.12)", text: "hsl(214 100% 45%)" },
  purple: { bg: "hsla(270,80%,60%,0.12)",  text: "hsl(270 80% 50%)"  },
  red:    { bg: "hsla(0,84%,60%,0.12)",    text: "hsl(0 84% 50%)"    },
};

export default function NewsSectionHome() {
  const { ref, isVisible } = useScrollAnimation();
  const { data: allNews = [] } = useHomepageNews();
  const news = allNews.filter((n) => n.published);

  return (
    <section ref={ref} className="py-16 sm:py-20 bg-card border-y border-border">
      <div className="max-w-6xl mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          className="flex items-center justify-between mb-8 gap-4"
        >
          <div>
            <h2 className="font-bold text-2xl sm:text-3xl text-foreground">
              Ultime Notizie
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Aggiornamenti normativi, novità e sponsorizzazioni
            </p>
          </div>
          <Link
            to="/blog"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
            style={{ color: "hsl(var(--pr-green))" }}
          >
            Tutti gli articoli <ArrowRight size={14} />
          </Link>
        </motion.div>

        {news.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={isVisible ? { opacity: 1 } : {}}
            className="text-center py-10 text-muted-foreground text-sm"
          >
            Nessuna notizia al momento. Torna presto per aggiornamenti.
          </motion.div>
        ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {news.map((item, i) => {
            const colors = BADGE_COLORS[item.badgeColor] ?? BADGE_COLORS.green;
            const CardContent = (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 24 }}
                animate={isVisible ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.08 * i }}
                className="bg-background border border-border rounded-2xl p-5 hover:shadow-md transition-shadow group cursor-pointer flex flex-col gap-3 h-full"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: colors.bg, color: colors.text }}
                  >
                    {item.badge}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar size={11} />{item.date}
                  </span>
                </div>
                <h3 className="font-semibold text-foreground leading-snug group-hover:text-[hsl(var(--pr-green))] transition-colors line-clamp-2">
                  {item.title}
                </h3>
                {item.excerpt && (
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 flex-1">
                    {item.excerpt}
                  </p>
                )}
                {item.link && (
                  <div
                    className="flex items-center gap-1 text-xs font-medium mt-auto pt-1"
                    style={{ color: "hsl(var(--pr-green))" }}
                  >
                    Leggi di più <ExternalLink size={11} />
                  </div>
                )}
              </motion.div>
            );

            return item.link ? (
              <a
                key={item.id}
                href={item.link}
                target={item.link.startsWith("http") ? "_blank" : undefined}
                rel={item.link.startsWith("http") ? "noopener noreferrer" : undefined}
              >
                {CardContent}
              </a>
            ) : (
              <div key={item.id}>{CardContent}</div>
            );
          })}
        </div>
        )}

        <div className="sm:hidden mt-6 text-center">
          <Link
            to="/blog"
            className="inline-flex items-center gap-1.5 text-sm font-medium"
            style={{ color: "hsl(var(--pr-green))" }}
          >
            Tutti gli articoli <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
