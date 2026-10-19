import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { ApiProvider } from './api/ApiProvider.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { SearchProvider } from './search/SearchContext.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ApiProvider>
        <AuthProvider>
          <SearchProvider>
            <App />
          </SearchProvider>
        </AuthProvider>
      </ApiProvider>
    </QueryClientProvider>
  </StrictMode>,
)
