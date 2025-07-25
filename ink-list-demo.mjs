#!/usr/bin/env bun

// Download use-m dynamically
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

// Import React and Ink using use-m (with workaround for ink path)
const React = await use('react@latest')
const { useState, useEffect } = React
const { render, Text, Box, useApp } = await use('ink@latest/build/index.js')

// Simulated repository data
const mockRepos = [
  'react-components',
  'api-server',
  'frontend-dashboard',
  'mobile-app',
  'database-migrations',
  'auth-service',
  'notification-system',
  'payment-gateway',
  'analytics-engine',
  'deployment-scripts'
];

const messages = {
  pending: '',
  cloning: 'Starting clone...',
  pulling: 'Pulling changes...',
  success: ['Successfully cloned', 'Successfully pulled', 'Up to date'],
  failed: ['Network timeout', 'Permission denied', 'Merge conflict'],
  skipped: 'Private repo, no token provided',
  uncommitted: 'Has uncommitted changes, skipped'
};

function getStatusIcon(status) {
  switch (status) {
    case 'pending': return '⏳';
    case 'cloning': return '📦';
    case 'pulling': return '📥';
    case 'success': return '✅';
    case 'failed': return '❌';
    case 'skipped': return '⚠️ ';
    case 'uncommitted': return '🔄';
    default: return '❓';
  }
}

function getStatusColor(status) {
  switch (status) {
    case 'pending': return 'gray';
    case 'cloning':
    case 'pulling': return 'yellow';
    case 'success': return 'green';
    case 'failed': return 'red';
    case 'skipped': return 'yellow';
    case 'uncommitted': return 'cyan';
    default: return 'white';
  }
}

function getRandomMessage(status) {
  const msgs = messages[status];
  if (Array.isArray(msgs)) {
    return msgs[Math.floor(Math.random() * msgs.length)];
  }
  return msgs || '';
}

function StatusLine({ repo, maxNameLength }) {
  const icon = getStatusIcon(repo.status);
  const color = getStatusColor(repo.status);
  const duration = `${repo.duration.toFixed(1)}s`;
  
  return React.createElement(Box, {},
    React.createElement(Text, { color }, icon),
    React.createElement(Text, {}, ` ${repo.name.padEnd(maxNameLength)} `),
    React.createElement(Text, { dimColor: true }, duration.padStart(6)),
    React.createElement(Text, {}, ` ${repo.message}`)
  );
}

function App() {
  const { exit } = useApp();
  const [repos, setRepos] = useState(() => 
    mockRepos.map(name => ({
      name,
      status: 'pending',
      message: '',
      startTime: Date.now(),
      duration: 0
    }))
  );
  const [startTime] = useState(Date.now());
  const [isComplete, setIsComplete] = useState(false);

  const maxNameLength = Math.max(...mockRepos.map(name => name.length));

  useEffect(() => {
    const intervals = [];
    
    // Update durations every 100ms
    const durationInterval = setInterval(() => {
      setRepos(prevRepos => 
        prevRepos.map(repo => ({
          ...repo,
          duration: (Date.now() - repo.startTime) / 1000
        }))
      );
    }, 100);
    intervals.push(durationInterval);

    // Simulate repository processing with random delays
    mockRepos.forEach((repoName) => {
      const delay = Math.random() * 5000 + 1000; // 1-6 seconds
      
      const timeout = setTimeout(() => {
        // First update to processing state
        const processingStatus = Math.random() > 0.5 ? 'cloning' : 'pulling';
        setRepos(prevRepos => 
          prevRepos.map(repo => 
            repo.name === repoName 
              ? { ...repo, status: processingStatus, message: getRandomMessage(processingStatus) }
              : repo
          )
        );

        // Then after a brief moment, complete the operation
        const completionDelay = Math.random() * 2000 + 500; // 0.5-2.5 seconds
        const completionTimeout = setTimeout(() => {
          const finalStatus = Math.random() > 0.8 ? 
            (Math.random() > 0.5 ? 'failed' : 'skipped') : 
            (Math.random() > 0.1 ? 'success' : 'uncommitted');
          
          setRepos(prevRepos => {
            const newRepos = prevRepos.map(repo => 
              repo.name === repoName 
                ? { ...repo, status: finalStatus, message: getRandomMessage(finalStatus) }
                : repo
            );
            
            // Check if all repos are complete
            const allComplete = newRepos.every(r => 
              ['success', 'failed', 'skipped', 'uncommitted'].includes(r.status)
            );
            
            if (allComplete) {
              setTimeout(() => setIsComplete(true), 1000);
            }
            
            return newRepos;
          });
        }, completionDelay);
        intervals.push(completionTimeout);
      }, delay);
      intervals.push(timeout);
    });

    return () => {
      intervals.forEach(clearTimeout);
      intervals.forEach(clearInterval);
    };
  }, []);

  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => {
        exit();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, exit]);

  // Calculate summary stats
  const summary = repos.reduce((acc, repo) => {
    switch (repo.status) {
      case 'success':
        if (repo.message.includes('cloned')) acc.cloned++;
        else acc.pulled++;
        break;
      case 'failed': acc.failed++; break;
      case 'skipped': acc.skipped++; break;
      case 'uncommitted': acc.uncommitted++; break;
    }
    return acc;
  }, { cloned: 0, pulled: 0, failed: 0, skipped: 0, uncommitted: 0 });

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  const summaryElements = [];
  if (isComplete) {
    summaryElements.push(React.createElement(Text, { key: 'empty' }, ''));
    summaryElements.push(React.createElement(Text, { key: 'header', color: 'blue', bold: true }, '📊 Summary:'));
    if (summary.cloned > 0) summaryElements.push(React.createElement(Text, { key: 'cloned', color: 'green' }, `✅ Cloned: ${summary.cloned}`));
    if (summary.pulled > 0) summaryElements.push(React.createElement(Text, { key: 'pulled', color: 'green' }, `✅ Pulled: ${summary.pulled}`));
    if (summary.uncommitted > 0) summaryElements.push(React.createElement(Text, { key: 'uncommitted', color: 'cyan' }, `🔄 Uncommitted changes: ${summary.uncommitted}`));
    if (summary.skipped > 0) summaryElements.push(React.createElement(Text, { key: 'skipped', color: 'yellow' }, `⚠️  Skipped: ${summary.skipped}`));
    if (summary.failed > 0) summaryElements.push(React.createElement(Text, { key: 'failed', color: 'red' }, `❌ Failed: ${summary.failed}`));
    summaryElements.push(React.createElement(Text, { key: 'time', color: 'blue' }, `⏱️  Total time: ${totalTime}s`));
    summaryElements.push(React.createElement(Text, { key: 'complete', color: 'blue' }, '🎉 Repository sync completed!'));
  }

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Box, { marginBottom: 1 },
      React.createElement(Text, { bold: true }, 'Repository Status')
    ),
    React.createElement(Box, { marginBottom: 1 },
      React.createElement(Text, { dimColor: true }, '─'.repeat(80))
    ),
    ...repos.map(repo => 
      React.createElement(StatusLine, {
        key: repo.name,
        repo,
        maxNameLength
      })
    ),
    isComplete && React.createElement(Box, { flexDirection: 'column', marginTop: 1 }, ...summaryElements)
  );
}

render(React.createElement(App));