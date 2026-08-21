import React from 'react';
import { AIProviderId } from '../../types';

interface ProviderLogoProps {
  provider: AIProviderId | string;
  className?: string;
  size?: number | string;
}

export const ProviderLogo: React.FC<ProviderLogoProps> = ({
  provider,
  className = 'w-4 h-4',
}) => {
  const p = (provider || '').toLowerCase();

  switch (p) {
    case 'google':
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            fill="#EA4335"
          />
        </svg>
      );

    case 'openai':
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.5973 8.3829l2.02-1.1638a.0804.0804 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4022-.686zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813v6.7227zm1.145-3.3213l3.047-1.756 3.047 1.756v3.512l-3.047 1.756-3.047-1.756z" />
        </svg>
      );

    case 'openrouter':
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 2L3 7.2v9.6L12 22l9-5.2V7.2L12 2z"
            stroke="#6366F1"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12 22V12M12 12L3 7.2M12 12l9-4.8"
            stroke="#6366F1"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'anthropic':
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M13.827 3.5h3.673l6.5 17h-3.873l-1.427-3.927h-6.845l-1.428 3.927H6.555L13.827 3.5zm3.627 10.155l-2.145-5.918-2.146 5.918h4.291zM2.873 20.5H0L5.345 6.5h2.873L2.873 20.5z"
            fill="#D97757"
          />
        </svg>
      );

    case 'xai':
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M2.5 2.5h4.84l4.24 6.22 4.4-6.22H21.5l-6.88 9.53L22 21.5h-4.84l-4.7-6.87-4.86 6.87H2l7.46-10.33L2.5 2.5zm4.87 2.4l8.92 14.2h2.84L10.21 4.9H7.37z" />
        </svg>
      );

    case 'deepseek':
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 13.5C3 8.253 7.253 4 12.5 4c3.856 0 7.18 2.302 8.65 5.618a1 1 0 0 1-1.378 1.285C18.23 10.15 16.51 9.5 14.7 9.5c-3.424 0-6.2 2.776-6.2 6.2 0 1.343.43 2.585 1.16 3.6a1 1 0 0 1-.82 1.58A9.475 9.475 0 0 1 3 13.5z"
            fill="#0066FF"
          />
          <path
            d="M14.7 11.5c-2.32 0-4.2 1.88-4.2 4.2 0 1.91 1.28 3.52 3.03 4.02a1 1 0 0 0 1.22-.97v-.55c0-.83.67-1.5 1.5-1.5h.7c2.21 0 4-1.79 4-4 0-1.21-.99-1.2-1.25-1.2h-5z"
            fill="#29B6F6"
          />
          <circle cx="8.5" cy="11.5" r="1" fill="#FFFFFF" />
        </svg>
      );

    case 'huggingface':
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="12" cy="12" r="10" fill="#FFD21E" />
          {/* Eyes */}
          <ellipse cx="8.5" cy="10" rx="1.5" ry="2" fill="#1F1E1B" />
          <ellipse cx="15.5" cy="10" rx="1.5" ry="2" fill="#1F1E1B" />
          <circle cx="9" cy="9.5" r="0.5" fill="#FFFFFF" />
          <circle cx="16" cy="9.5" r="0.5" fill="#FFFFFF" />
          {/* Smile */}
          <path
            d="M8.5 14.5c1 1.5 2.2 2 3.5 2s2.5-.5 3.5-2"
            stroke="#1F1E1B"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* Cheeks */}
          <circle cx="6.5" cy="12.5" r="1" fill="#FF9D00" opacity="0.6" />
          <circle cx="17.5" cy="12.5" r="1" fill="#FF9D00" opacity="0.6" />
        </svg>
      );

    case 'ollama':
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M10 2a1 1 0 0 0-1 1v2.18C7.83 5.6 7 6.7 7 8v2.5a.5.5 0 0 0 .5.5h1v4H7a2 2 0 0 0-2 2v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2h2v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2a2 2 0 0 0-2-2h-1v-4h1a.5.5 0 0 0 .5-.5V8c0-1.3-.83-2.4-2-2.82V3a1 1 0 0 0-1-1h-2zm-1 6a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm4 0a1 1 0 1 1 2 0 1 1 0 0 1-2 0z" />
        </svg>
      );

    default:
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
  }
};
