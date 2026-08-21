import React from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  EyeOff,
  CheckCircle2,
  FileText,
  Sparkles,
  Database,
  ArrowLeft,
  ExternalLink,
  Building2,
  Globe,
  Sliders,
  UserCheck,
  Server
} from 'lucide-react';

export const PrivacyPolicyPage: React.FC = () => {
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
                Privacy Policy
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
              <ShieldCheck className="w-3.5 h-3.5 text-[#3F7A5A]" />
              <span>Official Data Governance & Privacy Disclosure</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1F1E1B]">
              SanMine Space Privacy Policy
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs text-[#6B6862] pt-1">
              <span><strong>Effective Date:</strong> August 20, 2026</span>
              <span>•</span>
              <span><strong>Application:</strong> SanMine Space Platform</span>
              <span>•</span>
              <span><strong>Operator:</strong> SanMine Space Development Team (support.sanminespace@gmail.com)</span>
            </div>
          </div>

          {/* Quick Google Reviewer Q&A Executive Summary */}
          <div className="bg-[#FFFFFF] border-2 border-[#C66A3D]/30 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-[#E5E2DC] pb-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#C66A3D]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Google OAuth Verification Summary</span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-[#1F1E1B]">
                  Google API & Gmail Data Governance at a Glance
                </h2>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-[#C66A3D]/10 text-[#C66A3D] font-mono text-[11px] font-semibold shrink-0">
                gmail.send
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#6B6862]">
              <div className="p-3.5 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1">
                <p className="font-semibold text-[#1F1E1B]">1. What Google data does SanMine Space access?</p>
                <p className="leading-relaxed">Only user profile authentication data (Google Sign-In) and temporary authorization to dispatch outgoing emails when connected.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1">
                <p className="font-semibold text-[#1F1E1B]">2. Why does SanMine Space access Gmail?</p>
                <p className="leading-relaxed">Solely to send proposals and outreach emails that the user explicitly reviews, confirms, and authorizes in the application.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1">
                <p className="font-semibold text-[#1F1E1B]">3. What Gmail permission is requested?</p>
                <p className="leading-relaxed">Strictly <code className="font-semibold text-[#C66A3D]">https://www.googleapis.com/auth/gmail.send</code>.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1">
                <p className="font-semibold text-[#1F1E1B]">4. Does SanMine Space read Gmail messages?</p>
                <p className="leading-relaxed font-medium text-[#1F1E1B]">No. SanMine Space never requests read access, never reads inboxes, and never scans existing messages.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1">
                <p className="font-semibold text-[#1F1E1B]">5. How is Gmail OAuth data stored?</p>
                <p className="leading-relaxed">Tokens are managed server-side and encrypted with industry-standard cryptographic algorithms in restricted databases.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1">
                <p className="font-semibold text-[#1F1E1B]">6. Is Gmail data shared with AI providers?</p>
                <p className="leading-relaxed">No. Gmail data and credentials are never shared with AI models or external AI vendors.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1">
                <p className="font-semibold text-[#1F1E1B]">7. Is Gmail data sold?</p>
                <p className="leading-relaxed font-medium text-[#1F1E1B]">No. SanMine Space does not sell, rent, or monetize personal data or Google user data.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1">
                <p className="font-semibold text-[#1F1E1B]">8. Is Gmail data used for advertising or AI training?</p>
                <p className="leading-relaxed">No. Google user data is strictly prohibited from being used for advertising or AI model training.</p>
              </div>
            </div>
          </div>

          {/* Detailed Policy Sections */}
          <div className="space-y-10 text-sm leading-relaxed text-[#383633]">
            {/* Section 1 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">1.</span> Introduction
              </h2>
              <p>
                SanMine Space is an AI-powered business research, lead-generation, proposal-generation, and outreach application designed to help professionals discover commercial opportunities, analyze publicly available business web data, draft personalized client proposals, and optionally send authorized outreach communications.
              </p>
              <p>
                This Privacy Policy describes what information SanMine Space collects, how that information is utilized, stored, and protected, and under what circumstances data may be shared with necessary service providers.
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-4 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">2.</span> Information We Collect
              </h2>
              <p>
                To provide the platform services, SanMine Space processes specific categories of information based on user interactions:
              </p>

              <div className="space-y-3.5 pt-2">
                <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1.5">
                  <h3 className="font-semibold text-[#1F1E1B] flex items-center gap-2 text-sm">
                    <UserCheck className="w-4 h-4 text-[#3F7A5A]" />
                    Account Information
                  </h3>
                  <p className="text-xs text-[#6B6862]">
                    When you sign in using Google Identity or Firebase Authentication, SanMine Space processes your email address, display name, profile photo URL, and unique user identifier. This information is required to establish your account session, partition your private workspace, and enforce role-based access security.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1.5">
                  <h3 className="font-semibold text-[#1F1E1B] flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-[#2563EB]" />
                    Conversations & Workspace History
                  </h3>
                  <p className="text-xs text-[#6B6862]">
                    SanMine Space stores conversational inputs, user prompts, AI-generated responses, generated draft proposals, chat titles, timestamps, and related message metadata so you can maintain ongoing project history and retrieve previous research records across sessions.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1.5">
                  <h3 className="font-semibold text-[#1F1E1B] flex items-center gap-2 text-sm">
                    <Lock className="w-4 h-4 text-[#C66A3D]" />
                    User-Configured AI Provider Credentials
                  </h3>
                  <p className="text-xs text-[#6B6862]">
                    If you choose to configure custom third-party AI services (such as OpenAI or OpenRouter API keys) inside your account settings, SanMine Space stores these keys server-side to execute AI requests on your behalf. The application is designed to protect credentials server-side and never exposes raw API keys to browser clients.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1.5">
                  <h3 className="font-semibold text-[#1F1E1B] flex items-center gap-2 text-sm">
                    <Sliders className="w-4 h-4 text-[#7C3AED]" />
                    User Preferences & Automation Settings
                  </h3>
                  <p className="text-xs text-[#6B6862]">
                    Application preferences, including default AI models, outreach tone selections, automation thresholds, and UI display settings are saved to personalize your experience.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1.5">
                  <h3 className="font-semibold text-[#1F1E1B] flex items-center gap-2 text-sm">
                    <Globe className="w-4 h-4 text-[#3F7A5A]" />
                    Business & Website Research Data
                  </h3>
                  <p className="text-xs text-[#6B6862]">
                    SanMine Space gathers and processes publicly available business information, such as business names, trade categories, physical and geographic addresses, public website URLs, publicly listed contact email addresses and phone numbers, online ratings/review summaries, website page text, metadata, and research findings. This information is utilized solely for research analysis, lead qualification, value proposition drafting, and outreach preparation.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 3 & 4: Google Gmail Data & Usage */}
            <section className="space-y-4 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">3.</span> Google Gmail API & Data Access
              </h2>
              <p>
                SanMine Space offers an optional Gmail integration that enables users to send outreach proposals directly through their own Google accounts without leaving the workspace.
              </p>

              <div className="p-4 rounded-xl bg-[#FFFBF8] border border-[#F4E3D7] text-xs leading-relaxed space-y-2">
                <p className="font-semibold text-[#5C3822]">Explicit Gmail Permission Requested:</p>
                <code className="block bg-[#FFFFFF] p-2.5 rounded-lg border border-[#F4E3D7] text-[#C66A3D] font-mono font-semibold break-all">
                  https://www.googleapis.com/auth/gmail.send
                </code>
                <p className="text-[#5C3822]">
                  This restricted scope grants authorization strictly to compose and transmit outgoing emails authorized by the user.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] text-xs text-[#1F1E1B] space-y-2">
                <p className="font-bold">Strict Non-Access Statement:</p>
                <blockquote className="italic border-l-2 border-[#C66A3D] pl-3 py-0.5 text-[#6B6862]">
                  &ldquo;SanMine Space does not request permission to read, modify, or delete Gmail messages.&rdquo;
                </blockquote>
                <p className="text-[#6B6862]">
                  SanMine Space does not inspect your inbox, does not download incoming messages, does not read personal email correspondence, and does not alter email message folders.
                </p>
              </div>
            </section>

            {/* Section 4 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">4.</span> How Gmail Data Is Used
              </h2>
              <p>
                Gmail-related authorization tokens and metadata are used exclusively for:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-[#6B6862]">
                <li>Maintaining the user&apos;s authenticated Gmail connection status.</li>
                <li>Obtaining authorization to send email via Google&apos;s REST API on behalf of the user.</li>
                <li>Transmitting outgoing business proposals and messages that the user has explicitly drafted, reviewed, and authorized.</li>
                <li>Recording message delivery status (e.g., successful dispatch confirmation) for application audit logs.</li>
              </ul>
              <p className="text-xs text-[#6B6862]">
                Gmail data is <strong>never</strong> used for advertising, behavioral tracking, data brokerage, or training machine learning and artificial intelligence models.
              </p>
            </section>

            {/* Section 5 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">5.</span> Gmail OAuth Credentials & Token Storage
              </h2>
              <p>
                When you connect your Gmail account, Google OAuth 2.0 authorization codes are exchanged server-side for access and refresh tokens. These tokens are stored securely in server-side database storage and are isolated per user account.
              </p>
              <p className="text-xs text-[#6B6862]">
                OAuth credentials are used only to execute authorized API operations and are never exposed in client-side bundles or public endpoints.
              </p>
            </section>

            {/* Section 6 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">6.</span> Outreach Data & Audit Records
              </h2>
              <p>
                When users dispatch emails or execute outreach campaigns, SanMine Space records operational transaction metadata, including:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-[#6B6862]">
                <li>Recipient business name and destination email address.</li>
                <li>Public website URL associated with the target lead.</li>
                <li>Email subject line and dispatched body text.</li>
                <li>Transmission timestamp and delivery status.</li>
                <li>Google Gmail returned message identifier (for deduplication and status verification).</li>
              </ul>
              <p className="text-xs text-[#6B6862]">
                This data is stored to maintain your account outreach history, allow you to review past communications, and prevent accidental duplicate outreach to the same business contact.
              </p>
            </section>

            {/* Section 7 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">7.</span> AI Providers & Data Sharing
              </h2>
              <p>
                To provide AI conversational insights, research synthesis, and proposal drafting, SanMine Space communicates with the AI provider selected or configured for the request. Supported providers include:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] text-xs">
                  <p className="font-semibold text-[#1F1E1B]">Google Gemini API</p>
                  <p className="text-[11px] text-[#6B6862] mt-0.5">Direct AI reasoning and content generation.</p>
                </div>
                <div className="p-3 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] text-xs">
                  <p className="font-semibold text-[#1F1E1B]">OpenAI API</p>
                  <p className="text-[11px] text-[#6B6862] mt-0.5">When selected by user API keys or settings.</p>
                </div>
                <div className="p-3 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] text-xs">
                  <p className="font-semibold text-[#1F1E1B]">OpenRouter</p>
                  <p className="text-[11px] text-[#6B6862] mt-0.5">When configured for multi-model routing.</p>
                </div>
              </div>
              <p className="text-xs text-[#6B6862]">
                Information transmitted to the active AI provider is strictly limited to the user&apos;s prompt, conversation context, and the public business/web research data necessary to generate the requested output. Data is only sent to the specific AI provider executing that request.
              </p>
            </section>

            {/* Section 8 & 9 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">8.</span> Database Storage & Infrastructure
              </h2>
              <p>
                SanMine Space stores application records in secure server-side databases (such as Neon PostgreSQL and Firebase) to manage user accounts, persist chats, store outreach history, and maintain user preferences.
              </p>
              <p className="text-xs text-[#6B6862]">
                Database access is restricted to authenticated serverless backend routines through TLS-encrypted network channels.
              </p>
            </section>

            {/* Section 9 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">9.</span> Data Retention
              </h2>
              <p>
                We retain account information, conversations, research records, and outreach logs for as long as your account remains active and as necessary to provide service features, comply with legal requirements, resolve disputes, and maintain operational audit safety. Users may delete their conversations or request account data removal at any time.
              </p>
            </section>

            {/* Section 10 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">10.</span> Security Practices
              </h2>
              <p>
                We maintain reasonable technical and organizational security measures to protect user information from unauthorized access, loss, or disclosure. These measures include server-side credential isolation, encrypted token storage, HTTPS encryption in transit, and least-privilege API scope enforcement.
              </p>
              <p className="text-xs text-[#6B6862]">
                While we apply rigorous safeguards, no electronic transmission over the internet or storage system can be guaranteed to be completely impenetrable.
              </p>
            </section>

            {/* Section 11 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">11.</span> Third-Party Services
              </h2>
              <p>
                SanMine Space interacts with third-party service providers solely to deliver core application functionality:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-[#6B6862]">
                <li><strong>Google LLC:</strong> Google Identity Sign-In and Gmail REST API for email dispatch.</li>
                <li><strong>Firebase (Google Cloud):</strong> Authentication management and session verification.</li>
                <li><strong>AI Providers:</strong> Google Gemini, OpenAI, or OpenRouter for language generation.</li>
                <li><strong>Cloud Infrastructure:</strong> Vercel and Neon Database for serverless hosting and storage.</li>
              </ul>
            </section>

            {/* Section 12 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">12.</span> No Sale of Personal Information
              </h2>
              <p>
                SanMine Space does not sell, rent, monetize, or trade users&apos; personal information or Google user data to data brokers, advertising networks, or any commercial third parties.
              </p>
            </section>

            {/* Section 13 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">13.</span> User Rights & Choices
              </h2>
              <p>
                Users have full control over their account data and integrations:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-[#6B6862]">
                <li><strong>Disconnect Gmail:</strong> You can disconnect your Gmail integration at any time through the application UI or revoke access directly via your Google Account Security Settings.</li>
                <li><strong>Manage AI Keys:</strong> You can remove or update custom API keys in your settings menu.</li>
                <li><strong>Delete Data:</strong> You can delete chat histories or submit an account data deletion inquiry to the contact address below.</li>
              </ul>
            </section>

            {/* Section 14 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">14.</span> Children&apos;s Privacy
              </h2>
              <p>
                SanMine Space is a commercial business research platform not directed to children under 13 years of age (or under the applicable age of digital consent in your jurisdiction). We do not knowingly collect personal data from children.
              </p>
            </section>

            {/* Section 15 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">15.</span> Changes to This Privacy Policy
              </h2>
              <p>
                We may periodically update this Privacy Policy to reflect changes in our technology, application capabilities, or legal requirements. When updates occur, the &ldquo;Effective Date&rdquo; at the top of this document will be revised accordingly.
              </p>
            </section>

            {/* Section 16 */}
            <section className="space-y-3 bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1F1E1B] flex items-center gap-2">
                <span className="text-[#C66A3D]">16.</span> Contact & Data Inquiries
              </h2>
              <p>
                For questions regarding this Privacy Policy, your personal information, or Google OAuth verification questions, please contact:
              </p>
              <div className="p-4 rounded-xl bg-[#F7F6F2] border border-[#E5E2DC] space-y-1 text-xs">
                <p className="font-semibold text-[#1F1E1B]">SanMine Space Development & Data Team</p>
                <p className="text-[#6B6862]">Primary Inquiries: <a href="mailto:support.sanminespace@gmail.com" className="text-[#C66A3D] underline">support.sanminespace@gmail.com</a></p>
                <p className="text-[#6B6862]">Domain: <a href="https://sanmine.space" className="text-[#C66A3D] underline">https://sanmine.space</a></p>
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
            <span>Privacy Policy</span>
          </div>

          <div className="flex flex-wrap items-center gap-6 font-medium">
            <a href="/" className="hover:text-[#1F1E1B] underline underline-offset-4 transition-colors">
              Home
            </a>
            <a href="/terms" className="hover:text-[#1F1E1B] underline underline-offset-4 transition-colors">
              Terms of Service
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
