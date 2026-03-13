import { useEffect, useMemo, useState } from "react";

const PUBLIC_NOTICES = [
  "সতর্কতা: কোনো ব্যক্তিগত পাসওয়ার্ড, OTP বা সিক্রেট এখানে শেয়ার করবেন না।",
  "সতর্কতা: সিস্টেম রক্ষণাবেক্ষণ চলমান—গুরুত্বপূর্ণ কাজের আগে ব্যাকআপ রাখুন।",
  "সতর্কতা: অনুমোদন ছাড়া অ্যাডমিন এক্সেস বা মাস্টার সিক্রেট কারও সাথে শেয়ার করবেন না।",
  "সতর্কতা: নতুন আপডেট লাইভে দেওয়ার আগে টেস্ট পরিবেশে যাচাই করুন।",
  "সতর্কতা: সন্দেহজনক ইনপুট বা অস্বাভাবিক আচরণ দেখলে সাথে সাথে রিপোর্ট করুন।",
  "সতর্কতা: এই সিস্টেমের অপারেশনাল কমান্ড শুধু অনুমোদিত উৎস থেকে গ্রহণযোগ্য।",
];

function getNoticeIndexByHour(date = new Date()) {
  return date.getHours() % PUBLIC_NOTICES.length;
}

const PublicStatus = () => {
  const [noticeIndex, setNoticeIndex] = useState<number>(() => getNoticeIndexByHour());

  useEffect(() => {
    const syncNotice = () => setNoticeIndex(getNoticeIndexByHour());
    syncNotice();

    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(60, 0, 0);
    const delayMs = Math.max(1000, nextHour.getTime() - now.getTime());

    let intervalId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      syncNotice();
      intervalId = window.setInterval(syncNotice, 60 * 60 * 1000);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, []);

  const currentNotice = useMemo(() => PUBLIC_NOTICES[noticeIndex], [noticeIndex]);

  return (
    <main className="min-h-screen bg-foreground text-background flex items-center justify-center px-6">
      <section className="w-full max-w-3xl text-center space-y-6">
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">TIVO AI OS Backend Engine</h1>
        <p className="text-base sm:text-lg text-background/80">Public Notice Board</p>
        <div className="border border-background/20 rounded-2xl p-6 sm:p-8 bg-background/5">
          <p className="text-lg sm:text-2xl font-medium leading-relaxed">{currentNotice}</p>
        </div>
        <p className="text-xs sm:text-sm text-background/70">মেসেজ প্রতি ঘন্টায় স্বয়ংক্রিয়ভাবে পরিবর্তিত হয়।</p>
      </section>
    </main>
  );
};

export default PublicStatus;
