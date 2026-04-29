import type { Metadata } from "next";
import DownloadContent from "./DownloadContent";

export const metadata: Metadata = {
  title: "تحميل ForexYemeni v3.3 — إشارات تداول احترافية",
  description: "حمل تطبيق ForexYemeni Signals الإصدار 3.3 — إشارات تداول ذهب وفوركس احترافية مع تنبيهات فورية",
  openGraph: {
    title: "ForexYemeni Signals v3.3",
    description: "نظام احترافي لإشارات التداول",
    type: "website",
  },
};

export default function DownloadPage() {
  return <DownloadContent />;
}
