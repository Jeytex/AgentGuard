import './globals.css'
import type { Metadata } from 'next'
export const metadata: Metadata={title:'AgentGuard — Security Operations',description:'AI agent security and reliability middleware console.'}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
