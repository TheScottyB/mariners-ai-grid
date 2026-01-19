/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Mariner's AI Grid - Tactical "Liquid Glass" palette
        glass: {
          DEFAULT: 'rgba(255, 255, 255, 0.1)',
          dark: 'rgba(0, 0, 0, 0.3)',
          light: 'rgba(255, 255, 255, 0.15)',
          border: 'rgba(255, 255, 255, 0.2)',
        },
        // IMO Standard Alert Colors
        alert: {
          info: {
            bg: '#1a237e',
            border: '#3949ab',
            text: '#e8eaf6',
          },
          caution: {
            bg: '#33691e',
            border: '#558b2f',
            text: '#f1f8e9',
          },
          warning: {
            bg: '#e65100',
            border: '#ff9800',
            text: '#fff3e0',
          },
          danger: {
            bg: '#b71c1c',
            border: '#f44336',
            text: '#ffebee',
          },
          emergency: {
            bg: '#4a148c',
            border: '#9c27b0',
            text: '#f3e5f5',
          },
        },
        // Consensus indicators
        consensus: {
          agree: '#22c55e',    // Green - local matches global
          partial: '#f59e0b', // Amber - partial agreement
          disagree: '#ef4444', // Red - divergent predictions
        },
        // Marine tactical
        marine: {
          deep: '#0a1628',
          surface: '#1e3a5f',
          foam: '#e0f2fe',
        },
      },
      backdropBlur: {
        xs: '2px',
        glass: '12px',
      },
      boxShadow: {
        glass: '0 4px 30px rgba(0, 0, 0, 0.1)',
        'glass-inset': 'inset 0 0 30px rgba(255, 255, 255, 0.05)',
      },
    },
  },
  plugins: [],
}
