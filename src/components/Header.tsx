import React from 'react';

interface HeaderProps {
  title: string;
  onSearch: (val: string) => void;
  onRefresh: () => void;
  showSearch: boolean; // Acts as "enableSearch"
  searchValue: string;
  onClearSearch: () => void;
  onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ title, onSearch, onRefresh, showSearch, searchValue, onClearSearch, onMenuClick }) => {
  const [isSearchExpanded, setIsSearchExpanded] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const toggleSearch = () => {
    if (isSearchExpanded) {
      // Close search
      setIsSearchExpanded(false);
      onSearch(''); // Clear search when closing
    } else {
      // Open search
      setIsSearchExpanded(true);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 300);
    }
  };

  return (
    <header className="custom-header">
      <div className="left">
        <button className="icon-btn" onClick={onMenuClick} style={{marginRight: '8px', fontSize: '24px'}}>☰</button>
        <div className="logo">
          <img className="logo-img" src="assets/logo.png" alt="FH Logo" />
        </div>
        <div className="title">{title}</div>
      </div>

      <div className="center"></div>

      <div className="right">
        {showSearch && (
          <div className="search-container">
             {/* Trigger Button (Visible when collapsed) */}
             <button 
               className={`search-trigger-btn ${isSearchExpanded ? 'hidden' : ''}`} 
               onClick={toggleSearch}
               style={{ fontSize: '1.2em', background: 'none', border: 'none' }}
             >
               🔍︎
             </button>

             {/* Expandable Search Box */}
            <div className={`search-box ${isSearchExpanded ? 'visible' : ''}`}>
              <input
                 ref={searchInputRef}
                 className="search-input"
                 type="text"
                 placeholder="姓名/預約編號/手機/房號"
                 value={searchValue}
                 onInput={(e) => onSearch((e.target as HTMLInputElement).value)}
               />
               <button className="search-clear" onClick={toggleSearch}>✕</button>
             </div>
          </div>
        )}
        <button className="icon-btn" onClick={onRefresh} style={{ fontSize: '2em' }}>⟳</button>
      </div>
    </header>
  );
};

export default Header;
