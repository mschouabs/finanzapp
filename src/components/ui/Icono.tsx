/* Set único de íconos de la app (Lucide, trazo 1.5, grilla de 24 px).
   Las secciones, viajes, metas y categorías guardan un emoji en la base
   (así siguen funcionando los datos y exportaciones existentes); acá se
   traduce cada uno a su ícono, para que en pantalla nunca se vea un emoji. */
import {
  AlertTriangle, Backpack, Baby, BarChart3, BedDouble, Beer, BookOpen, Briefcase, Bug, Calendar, Camera, Car,
  CarTaxiFront, Check, Clapperboard, ClipboardList, Coins, CreditCard, Dumbbell, Folder, Gem, Gift, GraduationCap,
  Guitar, Hand, Handshake, Home, Landmark, Laptop, LifeBuoy, Lightbulb, Lock, Map, Mic, Mountain, Package,
  PartyPopper, PawPrint, Pencil, PiggyBank, Pill, Pin, Plane, Receipt, Repeat, Sailboat, Scale, Scissors, Search,
  Shirt, Ship, ShoppingBag, ShoppingCart, Smartphone, Smile, Snowflake, Stamp, Stethoscope, Target, Tent, Ticket,
  Trash2, TreePalm, TrendingUp, Tv, Umbrella, Upload, Download, UtensilsCrossed, Wallet, Wrench, Banknote, Pizza,
  Bot, Circle, type LucideIcon,
} from 'lucide-react'

/** Emoji guardado → ícono. Las claves van sin el selector de variación (U+FE0F). */
const POR_EMOJI: Record<string, LucideIcon> = {
  '🎯': Target, '✈': Plane, '🚗': Car, '🏠': Home, '💻': Laptop, '📱': Smartphone, '🎓': GraduationCap,
  '💍': Gem, '🏖': Umbrella, '🛟': LifeBuoy, '🎸': Guitar, '🐶': PawPrint, '👶': Baby, '🏋': Dumbbell,
  '🎁': Gift, '💰': PiggyBank, '🏔': Mountain, '🗺': Map, '🚢': Ship, '🎒': Backpack, '🏝': TreePalm,
  '🗼': Landmark, '🎿': Snowflake, '🛶': Sailboat, '🏕': Tent, '📁': Folder, '💼': Briefcase, '💳': CreditCard,
  '📊': BarChart3, '🍽': UtensilsCrossed, '🏥': Stethoscope, '🛒': ShoppingCart, '🍕': Pizza, '💊': Pill,
  '🎬': Clapperboard, '👕': Shirt, '✂': Scissors, '📋': ClipboardList, '💡': Lightbulb, '📦': Package,
  '🏨': BedDouble, '🚕': CarTaxiFront, '🍻': Beer, '🎟': Ticket, '🎳': Ticket, '📚': BookOpen, '🛂': Stamp,
  '🛍': ShoppingBag, '📺': Tv, '🛠': Wrench, '📌': Pin, '🧾': Receipt, '📥': Download, '📤': Upload,
  '🔁': Repeat, '🔄': Repeat, '🐜': Bug, '🔍': Search, '📈': TrendingUp, '👛': Wallet, '🤖': Bot, '🏦': Landmark,
  '📅': Calendar, '⚠': AlertTriangle, '✓': Check, '✅': Check, '🎉': PartyPopper, '🤝': Handshake, '💵': Banknote,
  '💸': Banknote, '✏': Pencil, '🗑': Trash2, '⚖': Scale, '🔒': Lock, '🎤': Mic, '👋': Hand, '🙂': Smile,
  '📷': Camera, '🪙': Coins,
}

export function iconoDe(valor: string | null | undefined): LucideIcon {
  if (!valor) return Circle
  return POR_EMOJI[valor.replace(/️/g, '').trim()] ?? Folder
}

export function Icono({ nombre, size = 18, className = '', strokeWidth }: {
  nombre: string | null | undefined
  size?: number
  className?: string
  strokeWidth?: number
}) {
  const C = iconoDe(nombre)
  return <C size={size} className={className} strokeWidth={strokeWidth} aria-hidden="true" />
}
