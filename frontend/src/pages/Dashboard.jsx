import React, { useState, useEffect, useRef } from 'react';
import api from '../api/axiosConfig';
import AnalysisSection from '../components/AnalysisSection';
import ActivityTimeline from '../components/ActivityTimeline';
import RepoInsights from '../components/RepoInsights';
import LoadingSkeleton from '../components/LoadingSkeleton';
import SearchHistory from '../components/SearchHistory';

const HISTORY_KEY = 'gh-analyzer-history';

const getLanguageColor = (lang) => {
    const colors = {
        JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5',
        Java: '#b07219', HTML: '#e34c26', CSS: '#563d7c', 'C++': '#f34b7d',
        C: '#555555', 'C#': '#178600', PHP: '#4F5D95', Ruby: '#701516',
        Go: '#00ADD8', Rust: '#dea584', Swift: '#F05138', Kotlin: '#A97BFF',
        Dart: '#00B4AB', Shell: '#89e051', Vue: '#41b883', Jupyter: '#DA5B0B'
    };
    return colors[lang] || '#6366f1';
};

const Dashboard = () => {
    const [username, setUsername] = useState('');
    const [githubUser, setGithubUser] = useState(null);
    const [repos, setRepos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [errorType, setErrorType] = useState(''); // '404', 'rate', 'validation', 'generic'
    const [visualizations, setVisualizations] = useState([]);
    const [visualizingRepo, setVisualizingRepo] = useState(null);
    const [fullScreenImage, setFullScreenImage] = useState(null);
    const [generationCount, setGenerationCount] = useState(() => parseInt(sessionStorage.getItem('viz-count') || '0'));
    const [sortOrder, setSortOrder] = useState('Stars');
    const [filterLang, setFilterLang] = useState('All');
    const [searchHistory, setSearchHistory] = useState([]);
    const [showBackToTop, setShowBackToTop] = useState(false);
    const [shakeSearch, setShakeSearch] = useState(false);
    const resultsRef = useRef(null);

    // Load search history from localStorage
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
            setSearchHistory(saved);
        } catch { setSearchHistory([]); }
    }, []);

    // Back-to-top scroll listener
    useEffect(() => {
        const handleScroll = () => setShowBackToTop(window.scrollY > 500);
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const addToHistory = (name) => {
        const updated = [name, ...searchHistory.filter(h => h !== name)].slice(0, 5);
        setSearchHistory(updated);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    };

    const clearHistory = () => {
        setSearchHistory([]);
        localStorage.removeItem(HISTORY_KEY);
    };

    const handleVisualize = async (e, repoName) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (generationCount >= 7) {
            alert("You have reached the maximum limit of 7 visualisations per session.");
            return;
        }
        
        if (visualizingRepo === repoName) return;
        
        setVisualizingRepo(repoName);
        try {
            const response = await api.get(`/visualize/${githubUser.login}/${repoName}`);
            const imageBase64 = response.data.image;
            
            if (imageBase64) {
                setGenerationCount(prev => {
                    const newCount = prev + 1;
                    sessionStorage.setItem('viz-count', newCount.toString());
                    return newCount;
                });
                
                setVisualizations(prev => {
                    const newViz = { repoName, image: `data:image/png;base64,${imageBase64}`, id: Date.now() };
                    return [newViz, ...prev];
                });
                
                setTimeout(() => {
                    document.getElementById('visualisations-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            } else {
                throw new Error("Failed to generate image.");
            }
        } catch (err) {
            console.error("Visualization error: ", err);
            const backendMsg = err.response?.data?.error || err.message;
            if (backendMsg && backendMsg.includes("No suitable files")) {
                alert("This repository doesn't contain enough recognisable code files to generate a visualisation.");
            } else {
                alert("Failed to generate visualisation: " + backendMsg);
            }
        } finally {
            setVisualizingRepo(null);
        }
    };

    const triggerSearch = async (searchName) => {
        const target = searchName.trim();
        if (!target) return;

        const githubUsernameRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
        if (!githubUsernameRegex.test(target)) {
            setError('Invalid username. GitHub usernames can only contain alphanumeric characters and hyphens.');
            setErrorType('validation');
            setShakeSearch(true);
            setTimeout(() => setShakeSearch(false), 500);
            return;
        }

        setLoading(true);
        setError('');
        setErrorType('');
        setGithubUser(null);
        setRepos([]);
        setFilterLang('All');

        try {
            const [userRes, repoRes] = await Promise.all([
                api.get(`/github/users/${target}`),
                api.get(`/github/users/${target}/repos`)
            ]);
            setGithubUser(userRes.data);
            setRepos(repoRes.data);
            addToHistory(target);

            // Scroll to results
            setTimeout(() => {
                resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
        } catch (err) {
            console.error(err);
            if (err.response?.status === 404) {
                setError('User not found. Double-check the username spelling.');
                setErrorType('404');
            } else if (err.response?.status === 403 || err.response?.status === 429) {
                setError('GitHub API rate limit exceeded. Please wait a few minutes.');
                setErrorType('rate');
            } else {
                setError('Something went wrong. Please try again.');
                setErrorType('generic');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        triggerSearch(username);
    };

    const handleHistorySelect = (name) => {
        setUsername(name);
        triggerSearch(name);
    };

    // Sorting & Filtering
    const availableLanguages = ['All', ...new Set(repos.map(r => r.language).filter(Boolean))];
    const displayedRepos = repos
        .filter(r => filterLang === 'All' || r.language === filterLang)
        .sort((a, b) => {
            if (sortOrder === 'Stars') return b.stargazers_count - a.stargazers_count;
            if (sortOrder === 'Size') return (b.size || 0) - (a.size || 0);
            if (sortOrder === 'Updated') return new Date(b.updated_at) - new Date(a.updated_at);
            return 0;
        });

    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    };

    const errorIcons = { '404': '🔍', rate: '⏳', validation: '⚡', generic: '❌' };
    const errorClasses = { '404': 'error-404', rate: 'error-rate', validation: 'error-validation', generic: 'error-generic' };

    return (
        <div className="container" style={{ padding: '2rem 2rem 4rem', minHeight: '100vh' }}>
            {/* Header */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4rem' }}>
                <h1 style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>⚙</span>
                    <span style={{ background: 'linear-gradient(135deg, var(--accent-color), var(--accent-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        GitHub Analyzer & visualizer
                    </span>
                </h1>
            </header>

            {/* Hero Section */}
            <div className="animate-fade-in" style={{ textAlign: 'center', marginBottom: '4rem' }}>
                <h2 style={{
                    fontSize: 'clamp(2rem, 5vw, 3.5rem)',
                    fontWeight: '800',
                    marginBottom: '1rem',
                    letterSpacing: '-0.03em',
                    lineHeight: 1.1,
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa, #6366f1)',
                    backgroundSize: '300% 300%',
                    animation: 'gradientShift 4s ease infinite',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                }}>
                    Analyze GitHub Profiles & visualizer
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', fontSize: '1.1rem', maxWidth: '500px', margin: '0 auto 2.5rem' }}>
                    Enter a username to unlock deep insights into any developer's portfolio.
                </p>

                {/* Search Form */}
                <form
                    onSubmit={handleSearch}
                    className={shakeSearch ? 'animate-shake' : ''}
                    style={{ maxWidth: '560px', margin: '0 auto', display: 'flex', gap: '0.5rem' }}
                >
                    <input
                        type="text"
                        placeholder="Enter GitHub Username (e.g., octocat)"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="input-field"
                        style={{ padding: '1rem 1.25rem', fontSize: '1rem' }}
                    />
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ padding: '0 2rem', fontSize: '1rem', whiteSpace: 'nowrap' }}
                    >
                        {loading ? '⏳' : '🔍 Analyze'}
                    </button>
                </form>

                {/* Search History */}
                <SearchHistory history={searchHistory} onSelect={handleHistorySelect} onClear={clearHistory} />

                {/* Error Display */}
                {error && (
                    <div className={`error-card ${errorClasses[errorType] || 'error-generic'}`}>
                        <span style={{ fontSize: '1.5rem' }}>{errorIcons[errorType] || '❌'}</span>
                        <span style={{ fontSize: '0.9rem' }}>{error}</span>
                    </div>
                )}
            </div>

            {/* Loading Skeleton */}
            {loading && <LoadingSkeleton />}

            {/* Results */}
            {githubUser && !loading && (
                <div ref={resultsRef}>
                    {/* Profile Card */}
                    <div
                        className="glass-card animate-fade-in-up"
                        style={{ padding: '3rem', display: 'flex', alignItems: 'center', gap: '3rem', marginBottom: '2.5rem', flexWrap: 'wrap', position: 'relative', overflow: 'hidden' }}
                    >
                        {/* Accent glow behind avatar */}
                        <div style={{ position: 'absolute', left: '50px', top: '50%', transform: 'translateY(-50%)', width: '200px', height: '200px', background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)', pointerEvents: 'none', borderRadius: '50%' }}></div>

                        <img
                            src={githubUser.avatar_url}
                            alt={githubUser.login}
                            style={{
                                width: '140px', height: '140px', borderRadius: '50%',
                                border: '3px solid rgba(99, 102, 241, 0.4)',
                                boxShadow: '0 0 30px var(--accent-glow)',
                                position: 'relative', zIndex: 1
                            }}
                        />
                        <div style={{ flex: 1, minWidth: '280px', position: 'relative', zIndex: 1 }}>
                            <h2 style={{ fontSize: '2.25rem', fontWeight: '800', letterSpacing: '-0.02em' }}>
                                {githubUser.name || githubUser.login}
                            </h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem', fontSize: '1rem', fontFamily: 'var(--font-mono)' }}>
                                @{githubUser.login}
                            </p>

                            {githubUser.bio && (
                                <p style={{ marginBottom: '1.25rem', fontStyle: 'italic', fontSize: '1rem', color: 'var(--text-secondary)', maxWidth: '700px', lineHeight: 1.6 }}>
                                    "{githubUser.bio}"
                                </p>
                            )}

                            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                {githubUser.location && <span>📍 {githubUser.location}</span>}
                                {githubUser.company && <span>💼 {githubUser.company}</span>}
                                {githubUser.blog && (
                                    <span>🔗 <a href={githubUser.blog.startsWith('http') ? githubUser.blog : `https://${githubUser.blog}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)', textDecoration: 'none' }}>Website</a></span>
                                )}
                                {githubUser.twitter_username && (
                                    <span>🐦 <a href={`https://twitter.com/${githubUser.twitter_username}`} target="_blank" rel="noopener noreferrer" style={{ color: '#1DA1F2', textDecoration: 'none' }}>@{githubUser.twitter_username}</a></span>
                                )}
                                {githubUser.created_at && <span>📅 Joined {formatDate(githubUser.created_at)}</span>}
                            </div>

                            <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
                                {[
                                    { value: githubUser.public_repos, label: 'Repos' },
                                    { value: githubUser.followers, label: 'Followers' },
                                    { value: githubUser.following, label: 'Following' },
                                ].map(stat => (
                                    <div key={stat.label}>
                                        <div style={{ fontSize: '1.75rem', fontWeight: '800', fontFamily: 'var(--font-mono)' }}>{stat.value}</div>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stat.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <a
                            href={githubUser.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-primary"
                            style={{ padding: '0.875rem 2rem', fontSize: '0.95rem', alignSelf: 'flex-start' }}
                        >
                            View on GitHub →
                        </a>
                    </div>

                    {/* Analytics Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem', marginBottom: '2.5rem' }}>
                        <ActivityTimeline repos={repos} />
                        <RepoInsights repos={repos} />
                    </div>

                    {/* Analysis Section */}
                    <AnalysisSection repos={repos} />

                    {/* Visualisations Section */}
                    {visualizations.length > 0 && (
                        <div id="visualisations-section" className="animate-fade-in-up" style={{ marginBottom: '2.5rem' }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                🎨 Generated Visualisations
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                                {visualizations.map((viz) => (
                                    <div key={viz.id} className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <h4 style={{ fontWeight: '600', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{viz.repoName}</h4>
                                        <div style={{ borderRadius: '0.5rem', overflow: 'hidden', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px', position: 'relative' }}>
                                            <img src={viz.image} alt="Visualisation" style={{ width: '100%', height: 'auto', display: 'block', cursor: 'zoom-in' }} onClick={() => setFullScreenImage(viz.image)} />
                                            <button 
                                                onClick={() => setFullScreenImage(viz.image)}
                                                style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '0.4rem', borderRadius: '0.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', transition: 'all 0.2s ease' }}
                                                title="View Fullscreen"
                                            >
                                                ⛶
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Repos Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '700' }}>
                            📁 Repositories <span style={{ color: 'var(--text-secondary)', fontWeight: '400', fontSize: '1rem' }}>({displayedRepos.length})</span>
                        </h3>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="input-field" style={{ padding: '0.5rem 2rem 0.5rem 0.75rem', width: 'auto', fontSize: '0.85rem' }}>
                                <option value="Stars">⭐ Stars</option>
                                <option value="Updated">🕐 Recently Updated</option>
                                <option value="Size">📦 Size</option>
                            </select>
                            <select value={filterLang} onChange={(e) => setFilterLang(e.target.value)} className="input-field" style={{ padding: '0.5rem 2rem 0.5rem 0.75rem', width: 'auto', fontSize: '0.85rem' }}>
                                {availableLanguages.map(lang => (
                                    <option key={lang} value={lang}>{lang === 'All' ? '🌐 All Languages' : lang}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Repos Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
                        {displayedRepos.map((repo, index) => (
                            <a
                                key={repo.name}
                                href={repo.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ textDecoration: 'none', color: 'inherit', animation: `fadeInUp 0.4s ease ${index * 0.04}s both` }}
                            >
                                <div
                                    className="glass-card"
                                    style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        {repo.fork && <span style={{ fontSize: '0.65rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', fontWeight: '600' }}>FORK</span>}
                                        <h4 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--accent-color)', wordBreak: 'break-word', flex: 1 }}>{repo.name}</h4>
                                    </div>

                                    {repo.description && (
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.75rem', flex: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
                                            {repo.description}
                                        </p>
                                    )}

                                    {repo.topics && repo.topics.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
                                            {repo.topics.slice(0, 4).map(topic => (
                                                <span key={topic} style={{ background: 'rgba(99, 102, 241, 0.08)', color: 'var(--accent-color)', padding: '0.15rem 0.5rem', borderRadius: '1rem', fontSize: '0.7rem', fontWeight: '500', border: '1px solid rgba(99,102,241,0.15)' }}>
                                                    {topic}
                                                </span>
                                            ))}
                                            {repo.topics.length > 4 && <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', alignSelf: 'center' }}>+{repo.topics.length - 4}</span>}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.04)', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                            {repo.language && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: getLanguageColor(repo.language), display: 'inline-block' }}></span>
                                                    {repo.language}
                                                </span>
                                            )}
                                            <span>⭐ {repo.stargazers_count}</span>
                                            {repo.forks_count > 0 && <span>🍴 {repo.forks_count}</span>}
                                        </div>
                                        <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', opacity: 0.7 }}>
                                            {formatDate(repo.updated_at)}
                                        </span>
                                    </div>
                                    <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                                        <button 
                                            onClick={(e) => handleVisualize(e, repo.name)} 
                                            disabled={visualizingRepo === repo.name}
                                            style={{ background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-color)', border: '1px solid rgba(99,102,241,0.3)', padding: '0.3rem 0.6rem', borderRadius: '0.3rem', fontSize: '0.75rem', cursor: visualizingRepo === repo.name ? 'progress' : 'pointer', transition: 'all 0.2s ease', fontWeight: 'bold', opacity: visualizingRepo === repo.name ? 0.7 : 1 }}
                                        >
                                            {visualizingRepo === repo.name ? '⏳ Visualising...' : '👁️ Visualise'}
                                        </button>
                                    </div>
                                </div>
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {/* Back to Top */}
            <button
                className={`back-to-top ${showBackToTop ? 'visible' : ''}`}
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                title="Back to top"
            >
                ↑
            </button>

            {/* Full Screen Image Modal */}
            {fullScreenImage && (
                <div 
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', cursor: 'zoom-out' }}
                    onClick={() => setFullScreenImage(null)}
                >
                    <img src={fullScreenImage} alt="Full Screen Visualisation" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '0.5rem', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }} />
                    <button 
                        style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: '2rem', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', cursor: 'pointer', transition: 'all 0.2s ease' }}
                        onClick={(e) => { e.stopPropagation(); setFullScreenImage(null); }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        title="Close Fullscreen"
                    >
                        ×
                    </button>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
