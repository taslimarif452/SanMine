import React, { useState, useRef, useEffect } from 'react';
import { Menu, SquarePen } from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { useAuth } from '../../context/AuthContext';

export const TopBar: React.FC = () => {
  const {
    currentView,
    createNewTask,
    mobileSidebarOpen,
    toggleMobileSidebar,
  } = useAgent();

  const { currentUser } = useAuth();
  const [userProfileOpen, setUserProfileOpen] = useState<boolean>(false);
  const profilePopoverRef = useRef<HTMLDivElement>(null);

  const userDisplayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User';
  const userInitial = (userDisplayName[0] || 'U').toUpperCase();

  // Close profile popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (profilePopoverRef.current && !profilePopoverRef.current.contains(e.target as Node)) {
        setUserProfileOpen(false);
      }
    };
    if (userProfileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside, { passive: true });
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [userProfileOpen]);

  // If on Settings page: minimal clean top bar without border or background fill, no top-right new chat / profile buttons
  if (currentView === 'settings') {
    return (
      <div
        id="app-topbar"
        className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-3 sm:px-4 md:px-6 pointer-events-none select-none z-30"
      >
        <div className="flex items-center gap-2 text-xs md:text-sm text-[#1F1E1B] min-w-0 pointer-events-auto">
          {/* Mobile Hamburger Button */}
          <button
            id="btn-mobile-sidebar-toggle"
            type="button"
            onClick={toggleMobileSidebar}
            aria-label={mobileSidebarOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
            aria-expanded={mobileSidebarOpen}
            aria-controls="mobile-app-sidebar"
            className="md:hidden p-1.5 -ml-1 mr-1 rounded-lg text-[#6F6B65] hover:text-[#1F1E1B] hover:bg-[#EAE8E1]/60 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#C66A3D] active:scale-95 shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // Chat page top bar: overlay floating controls preserving all buttons
  return (
    <div
      id="app-topbar"
      className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-3 sm:px-4 md:px-6 pointer-events-none select-none z-30"
    >
      {/* Left: Mobile Hamburger Button */}
      <div className="flex items-center gap-2 text-xs md:text-sm text-[#1F1E1B] min-w-0 pointer-events-auto">
        <button
          id="btn-mobile-sidebar-toggle"
          type="button"
          onClick={toggleMobileSidebar}
          aria-label={mobileSidebarOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
          aria-expanded={mobileSidebarOpen}
          aria-controls="mobile-app-sidebar"
          className="md:hidden p-1.5 -ml-1 mr-1 rounded-lg text-[#6F6B65] hover:text-[#1F1E1B] hover:bg-[#EAE8E1]/60 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#C66A3D] active:scale-95 shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Right controls: New Chat SVG Button + User Avatar */}
      <div className="relative flex items-center gap-2 shrink-0 pointer-events-auto" ref={profilePopoverRef}>
        {/* Top Right New Chat Button with SVG icon (no bg color, no border) */}
        <button
          id="btn-topbar-new-chat"
          type="button"
          onClick={createNewTask}
          aria-label="New Chat"
          title="New Chat"
          className="p-1.5 rounded-lg text-[#6F6B65] hover:text-[#1F1E1B] hover:bg-[#EAE8E1]/60 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#C66A3D] active:scale-95 flex items-center justify-center"
        >
          <SquarePen className="w-5 h-5 stroke-[1.9]" />
        </button>

        {/* User Avatar */}
        {currentUser?.photoURL ? (
          <img
            src={currentUser.photoURL}
            alt={userDisplayName}
            referrerPolicy="no-referrer"
            onClick={() => setUserProfileOpen((prev) => !prev)}
            className="w-7 h-7 rounded-full border border-[#E5E2DC] object-cover shadow-2xs cursor-pointer hover:border-[#C66A3D] transition-colors shrink-0 bg-[#FFFFFF]"
            title={userDisplayName}
          />
        ) : (
          <div
            onClick={() => setUserProfileOpen((prev) => !prev)}
            className="w-7 h-7 rounded-full bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center text-xs font-semibold text-[#C66A3D] shadow-2xs cursor-pointer hover:border-[#C66A3D] transition-colors shrink-0"
            title={userDisplayName}
          >
            {userInitial}
          </div>
        )}

        {/* Top Right Profile Popover showing username and email */}
        {userProfileOpen && (
          <div
            id="topbar-user-profile-popover"
            className="absolute top-10 right-0 w-60 bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl shadow-lg p-3 space-y-1 z-50 animate-in fade-in-50 zoom-in-95 pointer-events-auto"
          >
            <div className="flex items-center gap-2.5">
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={userDisplayName}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full border border-[#E5E2DC] object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#FAF9F5] border border-[#E5E2DC] flex items-center justify-center text-xs font-semibold text-[#C66A3D] shrink-0 shadow-2xs">
                  {userInitial}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[#1F1E1B] truncate">
                  {userDisplayName}
                </div>
                <div className="text-[11px] text-[#6F6B65] truncate">
                  {currentUser?.email || 'No email'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};



