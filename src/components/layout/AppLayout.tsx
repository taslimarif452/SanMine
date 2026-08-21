import React from 'react';
import { useAgent } from '../../context/AgentContext';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ChatWorkspace } from '../chat/ChatWorkspace';
import { SettingsPage } from '../settings/SettingsPage';

export const AppLayout: React.FC = () => {
  const { currentView } = useAgent();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F7F6F2] text-[#1F1E1B] font-sans antialiased">
      {/* Zone 1: Unified Navigation Sidebar (Desktop persistent + Mobile slide-in drawer) */}
      <Sidebar />

      {/* Zone 2: Main Application Column (TopBar + Dynamic Page View) */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0 bg-[#F7F6F2] w-full">
        {/* Minimal Quiet TopBar */}
        <TopBar />

        {/* Dynamic View: Chat or Dedicated Settings Page */}
        <main className="flex-1 flex overflow-hidden relative bg-[#F7F6F2] w-full">
          {currentView === 'settings' ? <SettingsPage /> : <ChatWorkspace />}
        </main>
      </div>
    </div>
  );
};
