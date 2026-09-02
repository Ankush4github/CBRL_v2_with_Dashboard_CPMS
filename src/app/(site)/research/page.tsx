import type { Metadata } from 'next';
import { getResearch } from '@/lib/content';
import type { ResearchTopic } from '@/lib/content-types';
import { Mail, BookOpen } from 'lucide-react';
import HashScrollHandler from '@/components/HashScrollHandler';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export const metadata: Metadata = {
  title: 'Research Areas',
  description: 'CBRL research at IIT Kharagpur spans women\'s health — endometriosis, PCOS, pregnancy loss — and respiratory disease including asthma, COPD and lung cancer.',
  alternates: {
    canonical: 'https://cbrl.iitkgp.ac.in/research',
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    title: 'Research Areas | Clinical Biomarker Research Laboratory',
    description: 'Pioneering research in women\'s health and reproductive disorders (gestational hypertension, RIF, RPL, endometriosis, PCOS) and respiratory health (asthma, COPD, ILDs, lung cancer, silicosis) through advanced omics technologies at IIT Kharagpur.',
    url: 'https://cbrl.iitkgp.ac.in/research',
    type: 'website',
    locale: 'en_US',
    siteName: 'Clinical Biomarker Research Laboratory - CBRL',
    images: [
      {
        url: '/images/og/cbrl.jpg',
        width: 1200,
        height: 630,
        alt: 'CBRL Research Laboratory - Advanced Biomarker Research',
        type: 'image/jpeg'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    site: '@CBRLofficial',
    creator: '@CBRLofficial',
    title: 'Research Areas | CBRL',
    description: 'Cutting-edge omics research in women\'s health (gestational hypertension, RIF, RPL, PCOS, endometriosis) and respiratory disorders (asthma, COPD, ILDs, lung cancer, silicosis).',
    images: {
      url: '/images/og/cbrl.jpg',
      alt: 'CBRL Research Laboratory'
    }
  },
  other: {
    'research:institution': 'Indian Institute of Technology Kharagpur',
    'research:department': 'School of Medical Science and Technology',
    'research:pi': 'Prof. Koel Chaudhury',
    'research:focus': 'Women\'s Health, Respiratory Disorders',
    'research:technologies': 'Metabolomics, Proteomics, Lipidomics, Multi-omics'
  }
};

function ResearchArea({
  id,
  index,
  title,
  tagline,
  description,
  topics,
}: {
  id: string;
  index: string;
  title: string;
  tagline: string;
  description: string;
  topics: ResearchTopic[];
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t pt-10">
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-24">
            <span className="text-5xl font-bold tracking-tight text-primary/30 tabular-nums sm:text-6xl">
              {index}
            </span>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {tagline}
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>

        <div className="lg:col-span-8">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Disease areas in focus
          </p>
          <Accordion type="single" collapsible className="w-full">
            {topics.map((topic) => (
              <AccordionItem key={topic.id} value={topic.id}>
                <AccordionTrigger className="py-5">
                  <span className="flex flex-col gap-1.5 pr-4 text-left">
                    <span className="font-medium text-foreground">{topic.title}</span>
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {topic.summary}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  {topic.body.map((paragraph, i) => (
                    <p key={i} className="text-justify leading-relaxed text-muted-foreground">
                      {paragraph}
                    </p>
                  ))}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

export default async function Research() {
  const { areas } = await getResearch();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: "{\"@context\":\"https://schema.org\",\"@type\":\"FAQPage\",\"mainEntity\":[{\"@type\":\"Question\",\"name\":\"What is gestational hypertension?\",\"acceptedAnswer\":{\"@type\":\"Answer\",\"text\":\"Gestational hypertension is a condition characterized by new-onset high blood pressure that develops after 20 weeks of pregnancy in a normo-tensive woman.\"}},{\"@type\":\"Question\",\"name\":\"What is recurrent implantation failure?\",\"acceptedAnswer\":{\"@type\":\"Answer\",\"text\":\"Recurrent implantation failure refers to cases in which women have had three failed in vitro fertilization (IVF) attempts with good quality embryos.\"}},{\"@type\":\"Question\",\"name\":\"What is recurrent pregnancy loss?\",\"acceptedAnswer\":{\"@type\":\"Answer\",\"text\":\"Recurrent pregnancy loss, defined as consecutive failed two or more clinical pregnancies, can significantly impact emotional, mental and physical well-being of couples.\"}},{\"@type\":\"Question\",\"name\":\"What is endometriosis?\",\"acceptedAnswer\":{\"@type\":\"Answer\",\"text\":\"Endometriosis is a common chronic and debilitating gynaecological condition characterized by the growth of endometrial-like tissue outside the uterus, affecting around 10-15% of women of reproductive age in India.\"}},{\"@type\":\"Question\",\"name\":\"What is PCOS?\",\"acceptedAnswer\":{\"@type\":\"Answer\",\"text\":\"Polycystic Ovary Syndrome (PCOS) is a common endocrine disorder characterized by reproductive, metabolic, and hormonal abnormalities in women of reproductive age.\"}},{\"@type\":\"Question\",\"name\":\"What are interstitial lung diseases?\",\"acceptedAnswer\":{\"@type\":\"Answer\",\"text\":\"Interstitial lung diseases (ILDs) are a diverse group of inflammatory lung disorders characterized by progressive scarring of the lung tissue, leading to reduced elasticity and impaired gas exchange.\"}},{\"@type\":\"Question\",\"name\":\"What is silicosis?\",\"acceptedAnswer\":{\"@type\":\"Answer\",\"text\":\"Silicosis is a chronic occupational lung disease caused by inhalation of respirable crystalline silica dust, commonly encountered in mining, construction, and stone cutting.\"}}]}" }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: "{\"@context\":\"https://schema.org\",\"@type\":\"BreadcrumbList\",\"itemListElement\":[{\"@type\":\"ListItem\",\"position\":1,\"name\":\"Home\",\"item\":\"https://cbrl.iitkgp.ac.in/\"},{\"@type\":\"ListItem\",\"position\":2,\"name\":\"Research Areas\",\"item\":\"https://cbrl.iitkgp.ac.in/research\"}]}" }} />
      <div className="min-h-screen bg-background">
        <HashScrollHandler />

        {/* Editorial Header */}
        <PageHeader
          eyebrow="Diseases in Focus"
          title="Research Areas"
          tagline="Advancing Biomedical Science Through Innovation"
          lead="Our laboratory is dedicated to pioneering research in the areas of women's health and respiratory health utilizing cutting-edge omics technologies to develop innovative diagnostic and therapeutic solutions."
        />

        {/* Research Areas */}
        <section className="py-16 sm:py-20">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="mx-auto max-w-5xl space-y-16">
              {areas.map((area) => (
                <ResearchArea
                  key={area.id}
                  id={area.id}
                  index={area.index}
                  title={area.title}
                  tagline={area.tagline}
                  description={area.description}
                  topics={area.topics}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="border-t bg-muted/40 py-16 sm:py-20">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="mx-auto max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Collaboration
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Collaborate with Us
              </h2>
              <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
                Join us in advancing biomedical research and developing innovative solutions for better healthcare outcomes.
                We welcome collaborations with researchers, clinicians, and industry partners.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Button asChild size="lg">
                  <a href="/contact">
                    <Mail className="h-5 w-5" />
                    Contact Us
                  </a>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <a href="/publications">
                    <BookOpen className="h-5 w-5" />
                    View Publications
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
