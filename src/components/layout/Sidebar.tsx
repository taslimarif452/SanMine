import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  MessageSquare,
  Settings,
  PanelLeft,
  MoreVertical,
  Pencil,
  Trash2,
  AlertTriangle,
  X,
  Check,
  LogOut,
} from 'lucide-react';
import { useAgent, getConversationGroup } from '../../context/AgentContext';
import { useAuth } from '../../context/AuthContext';
import { ConversationThread } from '../../types';

export const Sidebar: React.FC = () => {
  const {
    sidebarCollapsed,
    setSidebarCollapsed,
    mobileSidebarOpen,
    closeMobileSidebar,
    conversations,
    currentConversationId,
    selectConversation,
    createNewTask,
    renameConversation,
    deleteConversation,
    currentView,
    openSettings,
  } = useAgent();

  const { currentUser, signOut } = useAuth();

  const isSettingsActive = currentView === 'settings';

  // Active dropdown or modal states
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState<boolean>(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameInputVal, setRenameInputVal] = useState<string>('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);

  const renameInputRef = useRef<HTMLInputElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const deleteModalRef = useRef<HTMLDivElement>(null);
  const logoutModalRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const mobileProfileMenuRef = useRef<HTMLDivElement>(null);

  const userDisplayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User';
  const userEmail = currentUser?.email || '';
  const userInitial = (userDisplayName[0] || 'U').toUpperCase();

  // Focus rename input on start
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  // Click outside listener for contextual menu, profile popup and delete dialog
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      // If clicking inside the menu or on a conversation options button, don't close immediately
      if (target.closest('[data-conversation-menu]') || target.closest('[data-options-btn]')) {
        return;
      }
      if (menuOpenId) {
        setMenuOpenId(null);
      }
      if (
        profileMenuOpen &&
        profileMenuRef.current &&
        !profileMenuRef.current.contains(target) &&
        mobileProfileMenuRef.current &&
        !mobileProfileMenuRef.current.contains(target)
      ) {
        setProfileMenuOpen(false);
      }
      if (deleteModalRef.current && !deleteModalRef.current.contains(target)) {
        setDeleteConfirmId(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (renamingId) {
          setRenamingId(null);
        }
        if (menuOpenId) {
          setMenuOpenId(null);
        }
        if (profileMenuOpen) {
          setProfileMenuOpen(false);
        }
        if (deleteConfirmId) {
          setDeleteConfirmId(null);
        }
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [renamingId, menuOpenId, deleteConfirmId, profileMenuOpen]);

  // Group conversations dynamically by updatedAt/createdAt
  const groupedConversations = React.useMemo(() => {
    const groups: {
      today: ConversationThread[];
      yesterday: ConversationThread[];
      previous7Days: ConversationThread[];
      older: ConversationThread[];
    } = {
      today: [],
      yesterday: [],
      previous7Days: [],
      older: [],
    };

    // Sort by updatedAt descending
    const sorted = [...conversations].sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt).getTime();
      return timeB - timeA;
    });

    for (const conv of sorted) {
      const groupName = getConversationGroup(conv.updatedAt || conv.createdAt);
      if (groupName === 'Today') {
        groups.today.push(conv);
      } else if (groupName === 'Yesterday') {
        groups.yesterday.push(conv);
      } else if (groupName === 'Previous 7 days') {
        groups.previous7Days.push(conv);
      } else {
        groups.older.push(conv);
      }
    }

    return groups;
  }, [conversations]);

  // Handle start rename
  const handleStartRename = (conv: ConversationThread, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpenId(null);
    setRenamingId(conv.id);
    setRenameInputVal(conv.title);
  };

  // Commit rename
  const handleSaveRename = (id: string) => {
    if (renameInputVal.trim()) {
      renameConversation(id, renameInputVal.trim());
    }
    setRenamingId(null);
  };

  // Start delete confirmation
  const handleStartDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpenId(null);
    setDeleteConfirmId(id);
  };

  // Confirm delete execution
  const handleConfirmDelete = (id: string) => {
    deleteConversation(id);
    setDeleteConfirmId(null);
  };

  // Render a single conversation row in the sidebar
  const renderConversationRow = (item: ConversationThread) => {
    const isActive = !isSettingsActive && currentConversationId === item.id;
    const isRenaming = renamingId === item.id;
    const isMenuOpen = menuOpenId === item.id;

    if (isRenaming) {
      return (
        <div
          key={item.id}
          className="p-1 flex items-center gap-1 bg-[#FFFFFF] border border-[#C66A3D] rounded-lg shadow-xs my-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={renameInputRef}
            type="text"
            value={renameInputVal}
            onChange={(e) => setRenameInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveRename(item.id);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setRenamingId(null);
              }
            }}
            className="flex-1 min-w-0 bg-transparent text-[#1F1E1B] text-xs font-medium px-2 py-1 focus:outline-none"
            aria-label="Rename conversation title"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSaveRename(item.id);
            }}
            className="p-1.5 rounded-md text-[#3F7A5A] hover:bg-[#EBF3ED] active:bg-[#D8ECD9] transition-colors cursor-pointer shrink-0"
            title="Save title"
            aria-label="Save title"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRenamingId(null);
            }}
            className="p-1.5 rounded-md text-[#6B6862] hover:bg-[#F2F1ED] active:bg-[#E5E2DC] transition-colors cursor-pointer shrink-0"
            title="Cancel rename"
            aria-label="Cancel rename"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    return (
      <div
        key={item.id}
        className={`group relative flex items-center justify-between rounded-lg transition-colors cursor-pointer ${
          isActive
            ? 'bg-[#E5E2DC] text-[#1F1E1B] font-medium'
            : 'text-[#6B6862] hover:text-[#1F1E1B] hover:bg-[#EAE8E1]'
        }`}
      >
        {/* Main Conversation Selection Click Target */}
        <button
          type="button"
          onClick={() => {
            selectConversation(item.id);
            closeMobileSidebar();
          }}
          className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-2 text-xs text-left truncate cursor-pointer select-none"
          title={item.title}
        >
          <span className="truncate flex-1">{item.title}</span>
        </button>

        {/* Three-Dot Options Button ⋮ */}
        <div className="relative shrink-0 pr-1">
          <button
            type="button"
            data-options-btn="true"
            aria-label="Conversation options"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpenId((prev) => (prev === item.id ? null : item.id));
            }}
            className={`w-7 h-7 flex items-center justify-center rounded-md text-[#9C988F] hover:text-[#1F1E1B] hover:bg-[#DCD8CF]/60 transition-all cursor-pointer ${
              isMenuOpen
                ? 'opacity-100 bg-[#DCD8CF]/80 text-[#1F1E1B]'
                : 'opacity-90 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100'
            }`}
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {/* Contextual Options Menu */}
          {isMenuOpen && (
            <div
              data-conversation-menu="true"
              className="absolute right-0 top-full mt-1 w-32 bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl shadow-xl py-1 z-50 animate-in fade-in-50"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => handleStartRename(item, e)}
                className="w-full px-3 py-2 text-xs text-left text-[#1F1E1B] hover:bg-[#F7F6F2] active:bg-[#EAE8E1] flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Pencil className="w-3.5 h-3.5 text-[#6B6862]" />
                <span>Rename</span>
              </button>

              <button
                type="button"
                onClick={(e) => handleStartDelete(item.id, e)}
                className="w-full px-3 py-2 text-xs text-left text-[#DC2626] hover:bg-[#FFF5F5] active:bg-[#FED7D7] flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Reusable conversation list content for expanded/mobile views
  const renderFullConversationList = () => (
    <>
      {/* Today Group */}
      {groupedConversations.today.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] font-medium text-[#9C988F] px-2 py-0.5">
            Today
          </div>
          {groupedConversations.today.map(renderConversationRow)}
        </div>
      )}

      {/* Yesterday Group */}
      {groupedConversations.yesterday.length > 0 && (
        <div className="space-y-1 pt-1">
          <div className="text-[11px] font-medium text-[#9C988F] px-2 py-0.5">
            Yesterday
          </div>
          {groupedConversations.yesterday.map(renderConversationRow)}
        </div>
      )}

      {/* Previous 7 Days Group */}
      {groupedConversations.previous7Days.length > 0 && (
        <div className="space-y-1 pt-1">
          <div className="text-[11px] font-medium text-[#9C988F] px-2 py-0.5">
            Previous 7 days
          </div>
          {groupedConversations.previous7Days.map(renderConversationRow)}
        </div>
      )}

      {/* Older Group */}
      {groupedConversations.older.length > 0 && (
        <div className="space-y-1 pt-1">
          <div className="text-[11px] font-medium text-[#9C988F] px-2 py-0.5">
            Older
          </div>
          {groupedConversations.older.map(renderConversationRow)}
        </div>
      )}

      {/* If no conversations exist */}
      {conversations.length === 0 && (
        <div className="px-2 py-4 text-center text-xs text-[#9C988F]">
          No conversations yet
        </div>
      )}
    </>
  );

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. MOBILE BACKDROP / OVERLAY                                              */}
      {/* ========================================================================= */}
      <div
        id="mobile-sidebar-backdrop"
        onClick={closeMobileSidebar}
        aria-hidden="true"
        className={`fixed inset-0 bg-black/45 z-40 md:hidden transition-opacity duration-250 ease-out ${
          mobileSidebarOpen
            ? 'opacity-100 pointer-events-auto backdrop-blur-[2px]'
            : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* ========================================================================= */}
      {/* 2. MOBILE DRAWER SIDEBAR                                                 */}
      {/* ========================================================================= */}
      <aside
        id="mobile-app-sidebar"
        role="dialog"
        aria-modal={mobileSidebarOpen ? true : undefined}
        aria-label="Navigation drawer"
        aria-hidden={!mobileSidebarOpen}
        className={`fixed inset-y-0 left-0 z-50 w-[240px] sm:w-[260px] max-w-[78vw] h-full bg-[#F2F1ED] border-r border-[#E5E2DC] shadow-2xl flex flex-col transform transition-transform duration-250 ease-out md:hidden select-none pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
      >
        {/* Mobile Header: Close Button + Brand Title */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-[#E5E2DC] shrink-0">
          <div
            className="flex items-center gap-2.5 cursor-pointer group"
            onClick={createNewTask}
            title="SanMine Space Home"
          >
            <span className="font-semibold text-[15px] tracking-tight text-[#1F1E1B] group-hover:text-[#C66A3D] transition-colors">
              SanMine Space
            </span>
          </div>

          <button
            id="btn-close-mobile-sidebar"
            type="button"
            onClick={closeMobileSidebar}
            className="p-1.5 rounded-lg text-[#6F6B65] hover:text-[#1F1E1B] hover:bg-[#EAE8E1] transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#C66A3D]"
            aria-label="Close navigation drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile New Chat Button (No background color, no border - only text and SVG icon) */}
        <div className="px-3 py-2 shrink-0">
          <button
            id="btn-mobile-new-task"
            type="button"
            onClick={createNewTask}
            className="w-full flex items-center gap-2.5 py-2 px-2.5 rounded-lg text-xs font-medium text-[#1F1E1B] hover:bg-[#EAE8E1] transition-colors cursor-pointer active:scale-[0.99]"
            title="New Chat"
          >
            <Plus className="w-4 h-4 shrink-0 stroke-[2.2]" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Mobile Conversations Scrollable List */}
        <div className="flex-1 px-3 py-1 overflow-y-auto space-y-4 overscroll-contain">
          {renderFullConversationList()}
        </div>

        {/* Mobile Bottom Section: User Profile & Popover Menu */}
        <div className="relative p-3 border-t border-[#E5E2DC] space-y-1.5 shrink-0" ref={mobileProfileMenuRef}>
          {/* Mobile Profile Popup Menu showing Settings */}
          {profileMenuOpen && (
            <div
              id="mobile-sidebar-profile-menu"
              className="absolute bottom-full left-3 right-3 mb-2 bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl shadow-lg p-1.5 z-50 animate-in fade-in-50 zoom-in-95 space-y-1"
            >
              <div className="px-2.5 py-1.5 border-b border-[#F2F1ED]">
                <div className="text-xs font-semibold text-[#1F1E1B] truncate">{userDisplayName}</div>
                <div className="text-[11px] text-[#6F6B65] truncate">{userEmail || 'Signed in with Google'}</div>
              </div>

              {/* Settings Action */}
              <button
                id="btn-mobile-profile-settings"
                type="button"
                onClick={() => {
                  setProfileMenuOpen(false);
                  closeMobileSidebar();
                  openSettings();
                }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                  isSettingsActive
                    ? 'bg-[#E5E2DC] text-[#1F1E1B] font-medium'
                    : 'text-[#1F1E1B] hover:bg-[#F2F1ED]'
                }`}
                title="Settings"
              >
                <Settings className="w-4 h-4 text-[#C66A3D] shrink-0" />
                <span className="font-medium">Settings</span>
              </button>

              {/* Sign Out Action */}
              <button
                id="btn-mobile-profile-signout"
                type="button"
                onClick={() => {
                  setProfileMenuOpen(false);
                  setShowLogoutConfirm(true);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-[#DC2626] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span className="font-medium">Sign Out</span>
              </button>
            </div>
          )}

          {/* User Profile Click Trigger */}
          <div
            id="btn-mobile-user-profile"
            onClick={() => setProfileMenuOpen((prev) => !prev)}
            className="p-1.5 rounded-lg hover:bg-[#EAE8E1]/70 transition-colors cursor-pointer select-none"
            title={`${userDisplayName} (Click for Settings)`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={userDisplayName}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full border border-[#E5E2DC] object-cover shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center text-xs font-semibold text-[#C66A3D] shrink-0 shadow-2xs">
                  {userInitial}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[#1F1E1B] truncate">
                  {userDisplayName}
                </div>
                <div className="text-[10px] text-[#6F6B65] truncate">
                  {userEmail || 'Click for Settings'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 3. DESKTOP PERSISTENT SIDEBAR                                            */}
      {/* ========================================================================= */}
      <aside
        id="app-sidebar"
        aria-label="Desktop navigation sidebar"
        className={`hidden md:flex relative flex-col h-full shrink-0 border-r border-[#E5E2DC] bg-[#F2F1ED] text-[#1F1E1B] transition-all duration-200 z-30 select-none ${
          sidebarCollapsed ? 'w-[64px]' : 'w-[240px]'
        }`}
      >
        {/* Header: Logo hidden in expand sidebar, only shown in collapsed sidebar. ChatGPT PanelLeft toggle icon used */}
        <div className={`h-14 flex items-center border-b border-[#E5E2DC] ${
          sidebarCollapsed ? 'justify-between px-2.5' : 'justify-between px-3.5'
        }`}>
          {!sidebarCollapsed ? (
            <>
              <div
                className="flex items-center cursor-pointer group"
                onClick={createNewTask}
                title="SanMine Space Home"
              >
                <span className="font-semibold text-[15px] tracking-tight text-[#1F1E1B] group-hover:text-[#C66A3D] transition-colors">
                  SanMine Space
                </span>
              </div>

              <button
                id="btn-collapse-sidebar"
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="p-1.5 rounded-lg text-[#6F6B65] hover:text-[#1F1E1B] hover:bg-[#EAE8E1] transition-colors cursor-pointer"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <PanelLeft className="w-5 h-5 stroke-[1.8]" />
              </button>
            </>
          ) : (
            <div className="w-full flex items-center justify-between gap-1">
              <div
                className="flex items-center justify-center cursor-pointer p-1 rounded-md hover:bg-[#EAE8E1] transition-colors"
                onClick={createNewTask}
                title="SanMine Space Home"
              >
                <img
                  src="https://res.cloudinary.com/dbqmhnahl/image/upload/v1787146942/ChatGPT_Image_Aug_19_2026_07_00_19_PM_jpzwzg.png"
                  alt="SanMine Space Logo"
                  className="w-6 h-6 object-contain rounded-md shrink-0"
                  referrerPolicy="no-referrer"
                />
              </div>

              <button
                id="btn-expand-sidebar"
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                className="p-1.5 rounded-lg text-[#6F6B65] hover:text-[#1F1E1B] hover:bg-[#EAE8E1] transition-colors cursor-pointer"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <PanelLeft className="w-5 h-5 stroke-[1.8]" />
              </button>
            </div>
          )}
        </div>

        {/* New Chat Action Button (No background color, no border - only text and SVG icon) */}
        <div className={sidebarCollapsed ? 'p-2 pb-1 flex justify-center' : 'p-3 pb-2'}>
          <button
            id="btn-new-task"
            type="button"
            onClick={createNewTask}
            className={`flex items-center transition-colors cursor-pointer rounded-lg text-xs font-medium text-[#1F1E1B] hover:bg-[#EAE8E1] active:scale-[0.99] ${
              sidebarCollapsed
                ? 'p-2 justify-center'
                : 'w-full gap-2.5 py-2 px-2.5'
            }`}
            title="New Chat"
            aria-label="New Chat"
          >
            <Plus className="w-4 h-4 shrink-0 stroke-[2.2]" />
            {!sidebarCollapsed && <span>New Chat</span>}
          </button>
        </div>

        {/* Recent Conversations List */}
        <div className="flex-1 px-3 py-1 overflow-y-auto space-y-4">
          {!sidebarCollapsed ? (
            renderFullConversationList()
          ) : (
            /* Collapsed View */
            <div className="space-y-2 flex flex-col items-center">
              {conversations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectConversation(item.id)}
                  title={item.title}
                  aria-label={item.title}
                  className={`p-2 rounded-lg transition-colors cursor-pointer ${
                    !isSettingsActive && currentConversationId === item.id
                      ? 'bg-[#E5E2DC] text-[#C66A3D]'
                      : 'text-[#9C988F] hover:text-[#1F1E1B] hover:bg-[#EAE8E1]'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Divider & Bottom Section: User Profile & Contextual Settings Menu */}
        <div className="relative p-3 border-t border-[#E5E2DC] space-y-1.5" ref={profileMenuRef}>
          {/* Desktop Profile Popup Menu showing Settings */}
          {profileMenuOpen && (
            <div
              id="desktop-sidebar-profile-menu"
              className={`absolute mb-2 bg-[#FFFFFF] border border-[#E5E2DC] rounded-xl shadow-lg p-1.5 z-50 animate-in fade-in-50 zoom-in-95 space-y-1 ${
                sidebarCollapsed
                  ? 'bottom-2 left-16 w-52'
                  : 'bottom-full left-3 right-3'
              }`}
            >
              <div className="px-2.5 py-1.5 border-b border-[#F2F1ED]">
                <div className="text-xs font-semibold text-[#1F1E1B] truncate">{userDisplayName}</div>
                <div className="text-[11px] text-[#6F6B65] truncate">{userEmail || 'Signed in with Google'}</div>
              </div>

              {/* Settings Action */}
              <button
                id="btn-sidebar-profile-settings"
                type="button"
                onClick={() => {
                  setProfileMenuOpen(false);
                  openSettings();
                }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                  isSettingsActive
                    ? 'bg-[#E5E2DC] text-[#1F1E1B] font-medium'
                    : 'text-[#1F1E1B] hover:bg-[#F2F1ED]'
                }`}
                title="Settings"
              >
                <Settings className="w-4 h-4 text-[#C66A3D] shrink-0" />
                <span className="font-medium">Settings</span>
              </button>

              {/* Sign Out Action */}
              <button
                id="btn-sidebar-profile-signout"
                type="button"
                onClick={() => {
                  setProfileMenuOpen(false);
                  setShowLogoutConfirm(true);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-[#DC2626] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span className="font-medium">Sign Out</span>
              </button>
            </div>
          )}

          {/* User Profile */}
          {!sidebarCollapsed ? (
            <>
              <div
                id="btn-sidebar-user-profile"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                className="p-1.5 rounded-lg hover:bg-[#EAE8E1]/70 transition-colors cursor-pointer select-none"
                title={`${userDisplayName} (Click for Settings)`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {currentUser?.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt={userDisplayName}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-full border border-[#E5E2DC] object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center text-xs font-semibold text-[#C66A3D] shrink-0 shadow-2xs">
                      {userInitial}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#1F1E1B] truncate">
                      {userDisplayName}
                    </div>
                    <div className="text-[10px] text-[#6F6B65] truncate">
                      {userEmail || 'Click for Settings'}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 pt-1">
              <div
                id="btn-sidebar-collapsed-profile"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                className="cursor-pointer select-none"
                title={`${userDisplayName} (Click for Settings)`}
              >
                {currentUser?.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={userDisplayName}
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-full border border-[#E5E2DC] object-cover hover:border-[#C66A3D] transition-colors"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[#FFFFFF] border border-[#E5E2DC] flex items-center justify-center text-xs font-semibold text-[#C66A3D] shrink-0 shadow-2xs hover:border-[#C66A3D] transition-colors">
                    {userInitial}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 4. DELETE CONFIRMATION MODAL DIALOG (z-[60] above drawer)                 */}
      {/* ========================================================================= */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 bg-transparent flex items-center justify-center z-[60] p-4 animate-in fade-in-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteConfirmId(null);
          }}
        >
          <div
            ref={deleteModalRef}
            className="w-full max-w-sm bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-5 shadow-[0_16px_50px_rgba(0,0,0,0.12)] space-y-4 relative z-[61]"
          >
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-[#1F1E1B] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#DC2626]" />
                <span>Delete conversation?</span>
              </h3>
              <p className="text-xs text-[#6B6862] leading-relaxed">
                This conversation and its messages will be permanently removed.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F2F1ED]">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[#6B6862] hover:text-[#1F1E1B] hover:bg-[#F2F1ED] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDelete(deleteConfirmId)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] transition-colors cursor-pointer shadow-2xs"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. LOGOUT CONFIRMATION MODAL DIALOG                                       */}
      {/* ========================================================================= */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 bg-transparent flex items-center justify-center z-[70] p-4 animate-in fade-in-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowLogoutConfirm(false);
          }}
        >
          <div
            ref={logoutModalRef}
            className="w-full max-w-sm bg-[#FFFFFF] border border-[#E5E2DC] rounded-2xl p-5 shadow-[0_16px_50px_rgba(0,0,0,0.12)] space-y-4 relative z-[71]"
          >
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-[#1F1E1B] flex items-center gap-2">
                <LogOut className="w-4 h-4 text-[#C66A3D]" />
                <span>Sign out from SanMine Space?</span>
              </h3>
              <p className="text-xs text-[#6B6862] leading-relaxed">
                You are currently signed in as <span className="font-semibold text-[#1F1E1B]">{userEmail || userDisplayName}</span>. You can sign back in anytime with Google.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F2F1ED]">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[#6B6862] hover:text-[#1F1E1B] hover:bg-[#F2F1ED] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowLogoutConfirm(false);
                  await signOut();
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#C66A3D] hover:bg-[#B55B2E] transition-colors cursor-pointer shadow-2xs"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
