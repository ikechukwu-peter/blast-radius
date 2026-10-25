import {
  Activity, BarChart3, Bell, Bot, Boxes, Brain, Cloud, Cog, Container, Cpu, CreditCard, Database, FileText, Globe,
  HardDrive, Image, KeyRound, Layers, ListOrdered, Lock, Mail, MessageSquare, Monitor, Network, Radio, Router,
  Search, Server, Shield, ShoppingCart, Smartphone, Split, Timer, Users, Video, Workflow, Zap, type LucideIcon,
} from 'lucide-react';

/** Curated icons for custom components (a fixed set keeps the bundle small and names stable in saved designs). */
export const ICONS: Record<string, LucideIcon> = {
  server: Server, database: Database, cloud: Cloud, globe: Globe, users: Users, zap: Zap, split: Split,
  queue: ListOrdered, cog: Cog, lock: Lock, shield: Shield, key: KeyRound, mail: Mail, card: CreditCard,
  search: Search, storage: HardDrive, image: Image, video: Video, file: FileText, message: MessageSquare,
  bell: Bell, stream: Radio, network: Network, router: Router, cpu: Cpu, container: Container, boxes: Boxes,
  layers: Layers, workflow: Workflow, chart: BarChart3, activity: Activity, timer: Timer, phone: Smartphone,
  monitor: Monitor, cart: ShoppingCart, brain: Brain, bot: Bot,
};

export const ICON_NAMES = Object.keys(ICONS);

/** Accent swatches; all readable on the dark canvas and in exported PNGs. */
export const SWATCHES = ['#22d3ee', '#34d399', '#a78bfa', '#f59e0b', '#f43f5e', '#60a5fa', '#f472b6', '#94a3b8'];
