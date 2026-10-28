import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/modules/home/public-page-shell";
import { LocalizedText } from "@/components/shared/localized-text";

export const metadata: Metadata = {
  title: "Privacy Notice",
  description: "How Sohoj Academy handles information submitted through public interest and admission forms.",
};

export default function PrivacyPage() {
  return <PublicPageShell
    eyebrow={["Privacy & information", "গোপনীয়তা ও তথ্য"]}
    title={["Your information matters.", "আপনার তথ্য গুরুত্বপূর্ণ।"]}
    description={["A plain-language explanation of how public enquiry information is handled.","জনসাধারণের জমা দেওয়া নিবন্ধন তথ্য কীভাবে ব্যবহৃত হয় তার সহজ ব্যাখ্যা।"]}
  >
    <section className="mx-auto max-w-4xl space-y-8 px-5 py-12 text-sm leading-8 text-muted-foreground sm:px-6 lg:px-8 lg:py-16">
      <div><h2 className="text-xl font-semibold text-foreground"><LocalizedText en="What we collect" bn="কী তথ্য সংগ্রহ করা হয়"/></h2>
        <p className="mt-2"><LocalizedText en="Public forms ask for student and guardian names, class, school or locality, contact numbers, optional email, programme and subject preferences, and your message. We also record when the submission and consent occurred." bn="ফর্মে শিক্ষার্থী ও অভিভাবকের নাম, শ্রেণি, স্কুল বা এলাকা, মোবাইল, ঐচ্ছিক ইমেইল, প্রোগ্রাম ও বিষয় পছন্দ এবং মন্তব্য সংগ্রহ করা হয়। জমা ও সম্মতির সময়ও রেকর্ড করা হয়।"/></p></div>
      <div><h2 className="text-xl font-semibold text-foreground"><LocalizedText en="Why we use it" bn="কেন ব্যবহার করা হয়"/></h2>
        <p className="mt-2"><LocalizedText en="The information is used to review educational enquiries, communicate with guardians and assess possible programme placement. Submitting a form does not create a permanent student account or confirm admission." bn="একাডেমিক অনুসন্ধান যাচাই, অভিভাবকের সঙ্গে যোগাযোগ এবং সম্ভাব্য প্রোগ্রামে স্থান নির্ধারণের জন্য তথ্য ব্যবহার করা হয়। ফর্ম জমা দিলেই স্থায়ী শিক্ষার্থী অ্যাকাউন্ট বা ভর্তি নিশ্চিত হয় না।"/></p></div>
      <div><h2 className="text-xl font-semibold text-foreground"><LocalizedText en="Storage and access" bn="সংরক্ষণ ও প্রবেশাধিকার"/></h2>
        <p className="mt-2"><LocalizedText en="Submissions are stored in Sohojac's Cloudflare D1 database. The intended access is limited to authorized academy personnel. We do not request a student's password, national ID or payment details in the public enquiry form." bn="জমা দেওয়া তথ্য Sohojac-এর Cloudflare D1 ডাটাবেজে রাখা হয়। অনুমোদিত একাডেমি কর্মীদের জন্য প্রবেশাধিকার সীমিত রাখার পরিকল্পনা রয়েছে। পাবলিক ফর্মে শিক্ষার্থীর পাসওয়ার্ড, জাতীয় পরিচয়পত্র বা পেমেন্ট তথ্য চাওয়া হয় না।"/></p></div>
      <div><h2 className="text-xl font-semibold text-foreground"><LocalizedText en="Corrections and questions" bn="সংশোধন ও প্রশ্ন"/></h2>
        <p className="mt-2"><LocalizedText en="If information was submitted incorrectly, contact the academy through its official contact channels and provide your acknowledgement reference to request review or correction. Keep reference numbers private." bn="ভুল তথ্য জমা হলে একাডেমির অফিসিয়াল যোগাযোগ মাধ্যমে প্রাপ্তি স্বীকারপত্রের রেফারেন্স জানিয়ে যাচাই বা সংশোধনের অনুরোধ করুন। রেফারেন্স নম্বর ব্যক্তিগত রাখুন।"/></p></div>
      <p><Link href="/interest" className="font-semibold text-blue-300 underline underline-offset-2"><LocalizedText en="Back to registration" bn="নিবন্ধনে ফিরুন"/></Link></p>
    </section>
  </PublicPageShell>;
}
