import React from 'react';
import {
  ShieldCheck,
  FileText,
  Mail,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ArrowLeft,
  Scale,
  Sparkles,
  UserCheck,
  Building2,
  Sliders,
  Send,
  AlertCircle,
  EyeOff
} from 'lucide-react';

export const TermsOfServicePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#1F1E1B] font-sans antialiased flex flex-col selection:bg-[#C66A3D]/20 selection:text-[#1F1E1B]">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#F7F6F2]/90 backdrop-blur-md border-b border-[#E5E2DC]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <a
            href="/"
            className="flex items-center gap-3 group transition-opacity hover:opacity-80"
          >
            <img
              src="https://res.cloudinary.com/dbqmhnahl/image/upload/v1787146942/ChatGPT_Image_Aug_19_2026_07_00_19_PM_jpzwzg.png"
              alt="SanMine Space Logo"
              className="w-7 h-7 object-contain rounded-lg shadow-2xs"
              referrerPolicy="no-referrer"
            />
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-base tracking-tight text-[#1F1E1B]">
                SanMine Space
              </span>
              <span className="text-xs text-[#9C988F] hidden sm:inline-block">
                Terms of Service
              </span>
            </div>
          </a>

          <div className="flex items-center gap-4 text-xs font-medium">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-[#6B6862] hover:text-[#1F1E1B] transition-colors py-1 px-2.5 rounded-lg border border-[#E5E2DC] bg-[#FFFFFF] shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Document Content */}
      <main className="flex-1 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          {/* Header Title Section */}
          <div className="space-y-3 border-b border-[#E5E2DC] pb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFFFFF] border border-[#E5E2DC] shadow-2xs text-xs text-[#6B6862]">
              <Scale className="w-3.5 h-3.5 text-[#C66A3D]" />
              <span>Legal Terms & User Agreement</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1F1E1B]">
              SanMine Space Terms of Service
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs text-[#6B6862] pt-1">
              <span><strong>Effective Date:</strong> August 20, 2026</span>
              <span>•</span>
              <span><strong>Platform:</strong> SanMine Space</span>
              <span>•</span>
              <span><strong>Contact:</strong> support.sanminespace@gmail.com</span>
            </div>
          </div>

          {/* Google Verification Relevance Box */}
          <div className="bg-[#FFFFFF] border border-[#E5E2DC] rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#C66A3D]">
              <ShieldCheck className="w-4 h-4 text-[#3F7A5A]" />
              <span>Key Terms & Operational Disclosures</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[#6B6862]">
              <div className="p-3 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1">
                <p className="font-semibold text-[#1F1E1B]">Optional Gmail Integration</p>
                <p>Connecting Gmail is entirely voluntary and requires explicit user OAuth consent for outgoing email dispatch (<code className="text-[#C66A3D]">gmail.send</code>).</p>
              </div>
              <div className="p-3 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1">
                <p className="font-semibold text-[#1F1E1B]">User Review Mandatory</p>
                <p>AI-generated proposals and outreach copy must be reviewed by the user prior to reliance, submission, or transmission.</p>
              </div>
              <div className="p-3 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1">
                <p className="font-semibold text-[#1F1E1B]">Anti-Spam & Marketing Laws</p>
                <p>Users are strictly responsible for complying with applicable communication regulations (CAN-SPAM, GDPR, etc.) for all emails sent.</p>
              </div>
              <div className="p-3 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1">
                <p className="font-semibold text-[#1F1E1B]">No Inbox Access</p>
                <p>SanMine Space does not request read access to Gmail and never scans or monitors existing user messages.</p>
              </div>
            </div>
          </div>

          {/* Detailed Policy Sections */}
          <div className="space-y-8 text-sm leading-relaxed text-[#383633]">
            {/* Section 1 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">1.</span> Acceptance of Terms
              </h2>
              <p>
                By accessing, browsing, or utilizing the SanMine Space platform (the &ldquo;Service&rdquo;), you acknowledge that you have read, understood, and agree to be bound by these Terms of Service (these &ldquo;Terms&rdquo;) and our Privacy Policy. If you do not agree with any part of these Terms, you must not access or use the Service.
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">2.</span> Description of SanMine Space
              </h2>
              <p>
                SanMine Space is an intelligent workspace platform providing business research, lead discovery, public website analysis, artificial intelligence-assisted opportunity synthesis, customized proposal generation, and optional Gmail-based email outreach capabilities.
              </p>
              <p className="text-xs text-[#6B6862]">
                The Service is designed to assist professionals in preparing tailored commercial communications and discovering relevant business opportunities.
              </p>
            </section>

            {/* Section 3 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">3.</span> Eligibility & Account Responsibilities
              </h2>
              <p>
                To use SanMine Space, you must have the legal capacity to enter into binding agreements. When creating an account or authenticating through Google Identity / Firebase:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-[#6B6862]">
                <li>You must provide accurate, current, and complete identification information.</li>
                <li>You are solely responsible for maintaining the confidentiality of your account credentials.</li>
                <li>You accept full responsibility for all activities, actions, and outreach campaigns executed under your authenticated account.</li>
                <li>You agree to comply with all applicable regional, national, and international laws when using the platform.</li>
              </ul>
            </section>

            {/* Section 4 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">4.</span> AI-Generated Content & Verification Disclaimer
              </h2>
              <div className="p-4 rounded-xl bg-[#FFFBF8] border border-[#F4E3D7] text-xs text-[#5C3822] space-y-2">
                <p className="font-semibold text-[#1F1E1B]">Important Notice Regarding Artificial Intelligence Output:</p>
                <p>
                  AI-generated insights, research summaries, marketing proposals, value recommendations, and message drafts are produced algorithmically and may contain inaccuracies, omissions, outdated information, or hallucinations.
                </p>
              </div>
              <p className="text-xs text-[#6B6862]">
                <strong>User Responsibility:</strong> You are strictly responsible for reviewing, fact-checking, and editing all AI-generated research, business insights, email drafts, and proposal copy before relying on the information or transmitting it to prospective clients. SanMine Space does not represent or warrant that AI-generated content is accurate, complete, or legally sound.
              </p>
            </section>

            {/* Section 5 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">5.</span> Business Research & Public Information
              </h2>
              <p>
                SanMine Space processes publicly accessible online information (including corporate websites, public directories, open contact points, and published review summaries) to facilitate market research and lead generation.
              </p>
              <p className="text-xs text-[#6B6862]">
                Users are solely responsible for evaluating the accuracy of gathered public data and ensuring that their subsequent business interactions comply with applicable data protection and professional ethics standards.
              </p>
            </section>

            {/* Section 6 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">6.</span> Gmail Integration & Google API Policies
              </h2>
              <p>
                SanMine Space includes an optional feature that allows users to connect their personal or Google Workspace Gmail account:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-[#6B6862]">
                <li><strong>Voluntary Authorization:</strong> Connecting Gmail requires your explicit authorization via Google OAuth 2.0.</li>
                <li><strong>Restricted Scope:</strong> The integration utilizes the official Google Gmail REST API requesting strictly the <code className="bg-[#EAE6DF] px-1 py-0.5 rounded text-[#1F1E1B] font-mono">https://www.googleapis.com/auth/gmail.send</code> permission.</li>
                <li><strong>Purpose Limitation:</strong> The permission is used solely to transmit outreach emails that you explicitly draft, review, and authorize.</li>
                <li><strong>No Inbox Reading:</strong> SanMine Space does not request read access to your email and never reads, scans, indexes, or deletes existing mailbox messages.</li>
                <li><strong>Policy Adherence:</strong> Users must adhere to Google&apos;s API Services User Data Policy and acceptable use standards.</li>
              </ul>
            </section>

            {/* Section 7 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">7.</span> Outreach Responsibilities & Anti-Spam Compliance
              </h2>
              <p>
                When conducting email outreach using SanMine Space, you represent and warrant that:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-[#6B6862]">
                <li>You have a legitimate business purpose and lawful basis to contact each recipient.</li>
                <li>You comply with all applicable electronic messaging laws, including the CAN-SPAM Act, the General Data Protection Regulation (GDPR), the ePrivacy Directive, CASL, and other international anti-spam legislation.</li>
                <li>You provide truthful, accurate, and non-deceptive header and sender information.</li>
                <li>You include clear, operational opt-out or unsubscribe mechanisms where required by law and promptly honor recipient opt-out requests.</li>
                <li>You will not use SanMine Space for bulk spamming, phishing, fraud, malware distribution, harassment, or unlawful solicitation.</li>
              </ul>
            </section>

            {/* Section 8 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">8.</span> Third-Party Services & Integrations
              </h2>
              <p>
                SanMine Space relies on third-party service providers to deliver certain features, including Google LLC (Gmail API, Identity), Firebase, AI model providers (Google Gemini, OpenAI, OpenRouter), and hosting infrastructure providers.
              </p>
              <p className="text-xs text-[#6B6862]">
                Your use of these features is also governed by the applicable terms, conditions, and privacy policies of the respective third-party providers. SanMine Space is not responsible for the availability, performance, or acts of independent third-party services.
              </p>
            </section>

            {/* Section 9 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">9.</span> User API Keys & External Credentials
              </h2>
              <p>
                If you configure custom third-party AI credentials (e.g., OpenAI or OpenRouter API keys) inside your account settings, you represent that you possess all necessary rights and authorizations to use those keys and services.
              </p>
              <p className="text-xs text-[#6B6862]">
                You are responsible for monitoring and paying any usage fees charged by third-party API providers associated with your custom keys.
              </p>
            </section>

            {/* Section 10 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">10.</span> Prohibited Uses
              </h2>
              <p>
                You agree not to use SanMine Space to engage in or facilitate any of the following activities:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs text-[#6B6862]">
                <div className="p-2.5 rounded-lg bg-[#F7F6F2] border border-[#E5E2DC]">
                  <span className="font-semibold text-[#1F1E1B]">Illegal Acts:</span> Any unlawful activity or violation of municipal, national, or international regulations.
                </div>
                <div className="p-2.5 rounded-lg bg-[#F7F6F2] border border-[#E5E2DC]">
                  <span className="font-semibold text-[#1F1E1B]">Spam & Deception:</span> Unsolicited bulk messaging, phishing, deceptive subject lines, or impersonation.
                </div>
                <div className="p-2.5 rounded-lg bg-[#F7F6F2] border border-[#E5E2DC]">
                  <span className="font-semibold text-[#1F1E1B]">Security Bypass:</span> Circumventing rate limits, exploiting vulnerabilities, or unauthorized access.
                </div>
                <div className="p-2.5 rounded-lg bg-[#F7F6F2] border border-[#E5E2DC]">
                  <span className="font-semibold text-[#1F1E1B]">IP Infringement:</span> Violating intellectual property, trade secret, or privacy rights of any party.
                </div>
              </div>
            </section>

            {/* Section 11 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">11.</span> Intellectual Property Rights
              </h2>
              <p>
                <strong>SanMine Space IP:</strong> All rights, title, and interest in and to SanMine Space, including its source code, UI designs, trademarks, brand identity, documentation, and underlying proprietary technology, remain the exclusive property of the SanMine Space operator.
              </p>
              <p className="text-xs text-[#6B6862]">
                <strong>User Content:</strong> You retain ownership of any proprietary business data, customer records, and custom materials you lawfully provide to the platform. By utilizing the platform, you grant SanMine Space the limited license to process this content solely as necessary to operate and deliver the requested services.
              </p>
            </section>

            {/* Section 12 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">12.</span> Service Availability & Modifications
              </h2>
              <p>
                We continually improve and evolve SanMine Space. We reserve the right to update, modify, suspend, or discontinue any feature or portion of the Service at any time without prior liability.
              </p>
              <p className="text-xs text-[#6B6862]">
                We do not guarantee uninterrupted, error-free, or 100% uptime availability of the platform.
              </p>
            </section>

            {/* Section 13 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">13.</span> Disclaimer of Warranties
              </h2>
              <p className="text-xs uppercase font-semibold text-[#6B6862]">
                THE SERVICE IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR FREEDOM FROM ERRORS. AI OUTPUTS AND BUSINESS RESEARCH RESULTS ARE PROVIDED FOR INFORMATIONAL PURPOSES WITHOUT GUARANTEE OF COMPLETENESS OR ACCURACY.
              </p>
            </section>

            {/* Section 14 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">14.</span> Limitation of Liability
              </h2>
              <p className="text-xs text-[#6B6862] leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL SANMINE SPACE, ITS DEVELOPERS, OPERATORS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, USE, GOODWILL, OR BUSINESS OPPORTUNITY, ARISING OUT OF OR IN CONNECTION WITH YOUR ACCESS TO OR USE OF (OR INABILITY TO USE) THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
              </p>
            </section>

            {/* Section 15 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">15.</span> Indemnification
              </h2>
              <p>
                You agree to defend, indemnify, and hold harmless SanMine Space, its developers, operators, and agents from and against any third-party claims, damages, liabilities, costs, and expenses (including reasonable attorneys&apos; fees) arising out of or related to: (a) your use or misuse of the Service; (b) your outreach emails or communications sent through the platform; (c) your violation of these Terms or applicable laws; or (d) your infringement of any third-party right.
              </p>
            </section>

            {/* Section 16 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">16.</span> Termination
              </h2>
              <p>
                You may terminate your agreement with SanMine Space at any time simply by ceasing use of the platform and disconnecting any connected integrations.
              </p>
              <p className="text-xs text-[#6B6862]">
                We reserve the right to suspend or terminate your access to SanMine Space at our sole discretion, without notice, if you breach these Terms, engage in prohibited outreach or spamming, or if required for security or regulatory reasons.
              </p>
            </section>

            {/* Section 17 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">17.</span> Changes to Terms
              </h2>
              <p>
                We may revise these Terms of Service from time to time. When changes are made, the revised version will be published on this page with an updated &ldquo;Effective Date.&rdquo; Continued use of SanMine Space after revisions constitutes your acceptance of the updated Terms.
              </p>
            </section>

            {/* Section 18 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">18.</span> Contact & Legal Inquiries
              </h2>
              <p>
                If you have questions, concerns, or notices regarding these Terms of Service or SanMine Space operations, please contact:
              </p>
              <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1 text-xs">
                <p className="font-semibold text-[#1F1E1B]">SanMine Space Development Team</p>
                <p className="text-[#6B6862]">Inquiries: <a href="mailto:support.sanminespace@gmail.com" className="text-[#C66A3D] underline">support.sanminespace@gmail.com</a></p>
                <p className="text-[#6B6862]">Website: <a href="https://sanmine.space" className="text-[#C66A3D] underline">https://sanmine.space</a></p>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#F7F6F2] border-t border-[#E5E2DC] py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#6B6862]">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#1F1E1B]">SanMine Space</span>
            <span>•</span>
            <span>Terms of Service</span>
          </div>

          <div className="flex flex-wrap items-center gap-6 font-medium">
            <a href="/" className="hover:text-[#1F1E1B] underline underline-offset-4 transition-colors">
              Home
            </a>
            <a href="/privacy" className="hover:text-[#1F1E1B] underline underline-offset-4 transition-colors">
              Privacy Policy
            </a>
            <a
              href="mailto:support.sanminespace@gmail.com"
              className="hover:text-[#1F1E1B] underline underline-offset-4 transition-colors"
            >
              Support: support.sanminespace@gmail.com
            </a>
            <a
              href="https://tavqeer-hussain.web.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#1F1E1B] transition-colors"
            >
              Contact Developer
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
