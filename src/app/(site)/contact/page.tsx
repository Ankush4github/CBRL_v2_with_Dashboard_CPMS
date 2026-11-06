'use client';

import { useState, useEffect } from 'react';
import emailjs from '@emailjs/browser';
import {
  MapPin,
  Mail,
  Phone,
  User,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

// EmailJS configuration — set in .env.local
const EMAILJS_SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID ?? '';
const EMAILJS_TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID ?? '';
const EMAILJS_PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY ?? '';

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [cooldown, setCooldown] = useState(false);

  // Links elsewhere on the site prefill the subject: /contact?subject=Facility%20enquiry.
  // Read once on mount rather than through useSearchParams, which would need a
  // Suspense boundary around this whole statically rendered page.
  useEffect(() => {
    const subject = new URLSearchParams(window.location.search).get('subject');
    if (!subject) return;
    // A one-time copy from the URL, which the static render cannot see.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormData((prev) => ({ ...prev, subject: subject.slice(0, 150) }));
  }, []);

  // Auto-dismiss success/error messages after 6 seconds
  useEffect(() => {
    if (submitStatus === 'success' || submitStatus === 'error') {
      const timer = setTimeout(() => setSubmitStatus('idle'), 6000);
      return () => clearTimeout(timer);
    }
  }, [submitStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (cooldown) return;

    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
      setSubmitStatus('error');
      setErrorMessage('Email service is not configured. Please email us directly.');
      return;
    }

    setSubmitStatus('submitting');
    setErrorMessage('');

    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          name: formData.name,
          email: formData.email,
          title: formData.subject,
          message: formData.message,
        },
        EMAILJS_PUBLIC_KEY
      );

      setSubmitStatus('success');
      setFormData({ name: '', email: '', subject: '', message: '' });

      // Cooldown to prevent spam — 30 seconds
      setCooldown(true);
      setTimeout(() => setCooldown(false), 30000);
    } catch {
      // Not the thrown message: this form is public and unauthenticated, and
      // what EmailJS throws is its own transport detail ("The public key is
      // invalid", a raw gateway body) rather than anything a visitor can act on.
      setSubmitStatus('error');
      setErrorMessage('Failed to send message. Please try again or email us directly.');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const isSubmitting = submitStatus === 'submitting';

  return (
    <div className="min-h-screen">
      {/* Editorial page header */}
      <PageHeader
        eyebrow="Contact"
        title="Contact us"
        lead={<>Reach out to the Clinical Biomarker Research Laboratory about research, collaboration or facility access — we&apos;d love to hear from you.</>}
      />

      <div className="container mx-auto px-4 py-10 sm:px-6 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-5 lg:gap-10">
          {/* Contact details — structured definition list */}
          <div className="lg:col-span-2">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Lab Location</h2>

            <dl className="mt-8 space-y-8">
              <div>
                <dt className="flex items-center gap-2 meta">
                  <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Address
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-foreground">
                  Clinical Biomarker Research Laboratory<br />
                  Room No. 329,330, 3rd floor<br />
                  School of Medical Science and Technology<br />
                  Life Science Building<br />
                  Indian Institute of Technology Kharagpur<br />
                  Kharagpur-721302, West Bengal, India
                </dd>
              </div>

              <div>
                <dt className="flex items-center gap-2 meta">
                  <Mail className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Email
                </dt>
                <dd className="mt-2 text-sm">
                  <a
                    href="mailto:contact.cbrl@smst.iitkgp.ac.in"
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    contact.cbrl@smst.iitkgp.ac.in
                  </a>
                </dd>
              </div>

              <div>
                <dt className="flex items-center gap-2 meta">
                  <Phone className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Phone
                </dt>
                <dd className="mt-2 text-sm text-foreground">+91 03222 282221</dd>
              </div>
            </dl>

            <Separator className="my-10" />

            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Principal Investigator
            </h2>

            <dl className="mt-8 space-y-8">
              <div>
                <dt className="flex items-center gap-2 meta">
                  <User className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Office
                </dt>
                <dd className="mt-2 text-sm leading-relaxed">
                  <span className="font-medium text-foreground">Dr. Koel Chaudhury, Ph.D.</span>
                  <span className="block text-muted-foreground">
                    Professor<br />
                    School of Medical Science and Technology<br />
                    Indian Institute of Technology Kharagpur
                  </span>
                </dd>
              </div>

              <div>
                <dt className="flex items-center gap-2 meta">
                  <Mail className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Email
                </dt>
                <dd className="mt-2 text-sm">
                  <a
                    href="mailto:koel@smst.iitkgp.ac.in"
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    koel@smst.iitkgp.ac.in
                  </a>
                </dd>
              </div>
            </dl>
          </div>

          {/* Inquiry form — flat bordered card */}
          <div className="lg:col-span-3">
            <div className="panel p-6 sm:p-10">
              <p className="eyebrow">
                Enquiry
              </p>
              <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
                Send us a Message
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Fill out the form below and we&apos;ll get back to you as soon as possible.
              </p>

              <Separator className="my-6" />

              {/* Success notification */}
              {submitStatus === 'success' && (
                <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-600/30 bg-emerald-50 p-4 dark:bg-emerald-950/30">
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-medium text-emerald-600 dark:text-emerald-400">
                      Message sent successfully!
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Thank you for reaching out. We&apos;ll get back to you soon.
                    </p>
                  </div>
                </div>
              )}

              {/* Error notification */}
              {submitStatus === 'error' && (
                <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-destructive">Failed to send message</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {errorMessage || 'Please try again or email us directly at '}
                      <a
                        href="mailto:contact.cbrl@smst.iitkgp.ac.in"
                        className="font-medium underline underline-offset-4"
                      >
                        contact.cbrl@smst.iitkgp.ac.in
                      </a>
                    </p>
                  </div>
                </div>
              )}

              <div className="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label="Common topics">
                <span className="meta mr-1">Topic</span>
                {['General enquiry', 'Facility enquiry', 'Collaboration enquiry', 'Research opportunities at CBRL'].map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    aria-pressed={formData.subject === topic}
                    onClick={() => setFormData((prev) => ({ ...prev, subject: topic }))}
                    disabled={isSubmitting}
                    className={
                      'pressable min-h-[36px] rounded-full border px-3.5 text-xs font-semibold transition-colors ' +
                      (formData.subject === topic
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-background text-foreground/80 hover:border-primary/40')
                    }
                  >
                    {topic.replace(' at CBRL', '').replace(' enquiry', '')}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      disabled={isSubmitting}
                      placeholder="Your full name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">
                      Email <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      disabled={isSubmitting}
                      placeholder="your.email@example.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">
                    Subject <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="text"
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                    disabled={isSubmitting}
                    placeholder="What is this regarding?"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">
                    Message <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    required
                    disabled={isSubmitting}
                    rows={5}
                    placeholder="Write your message here..."
                    className="resize-y"
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting || cooldown}
                  className="h-12 w-full rounded-full"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      Sending...
                    </>
                  ) : cooldown ? (
                    'Message sent — please wait before sending again'
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                      Send Message
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>
        </div>

        {/* Map section */}
        <section className="mt-12 border-t pt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">
                Location
              </p>
              <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">
                Find Us on Map
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Life Science Building, Indian Institute of Technology Kharagpur, West Bengal, India
              </p>
            </div>
            <Button asChild variant="outline">
              <a
                href="https://maps.google.com/?q=Life+Science+Building,+IIT+Kharagpur"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in Maps
                <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          </div>

          <div className="mt-8 h-96 w-full overflow-hidden rounded-2xl border md:h-[500px]">
            <iframe
              src="https://www.google.com/maps?q=Life+Science+Building,+IIT+Kharagpur&z=17&output=embed"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Life Science Building, IIT Kharagpur Location"
            />
          </div>

          {/* Location metadata */}
          <dl className="mt-6 grid gap-6 border-t pt-6 sm:grid-cols-3">
            <div>
              <dt className="meta">
                Coordinates
              </dt>
              <dd className="mt-1 text-sm text-foreground">
                22°18&apos;54.1&quot;N 87°18&apos;44.7&quot;E
              </dd>
            </div>
            <div>
              <dt className="meta">
                Campus
              </dt>
              <dd className="mt-1 text-sm text-foreground">IIT Kharagpur Main Campus</dd>
            </div>
            <div>
              <dt className="meta">
                Building
              </dt>
              <dd className="mt-1 text-sm text-foreground">Life Science Building</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
