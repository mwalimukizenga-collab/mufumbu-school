import { useEffect, useState } from 'react'
import { Megaphone } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function ResultsTicker() {
  const [items, setItems] = useState([])

  useEffect(() => {
    supabase
      .from('exams')
      .select('id, name, academic_year, level, scope, classes(name)')
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .limit(12)
      .then(({ data }) => {
        if (data && data.length > 0) setItems(data)
      })
  }, [])

  // Show placeholder items if Supabase not yet ready / no published results
  const displayItems = items.length > 0
    ? items.map(e => ({
        id: e.id,
        text: `${e.name} — ${e.academic_year}${e.classes?.name ? ` (${e.classes.name})` : ''}`,
        level: e.level,
      }))
    : [
        { id: 1, text: 'Welcome to Mufumbu Secondary School — Student Results Portal', level: 'o_level' },
        { id: 2, text: 'Exam results will appear here once published by administration', level: 'a_level' },
      ]

  // Duplicate for seamless infinite loop
  const track = [...displayItems, ...displayItems]

  return (
    <div className="bg-amber-400 text-amber-900 overflow-hidden relative select-none">
      <div className="flex items-stretch">
        {/* Static label */}
        <div className="shrink-0 flex items-center gap-2 bg-amber-600 text-white px-4 py-2 text-sm font-bold z-10">
          <Megaphone size={15} />
          <span className="hidden sm:inline">RESULTS</span>
        </div>

        {/* Scrolling track */}
        <div className="overflow-hidden flex-1 flex items-center py-2">
          <div className="flex ticker-track gap-0">
            {track.map((item, i) => (
              <span key={i} className="flex items-center shrink-0 text-sm font-medium">
                <span className="px-6">{item.text}</span>
                <span className="text-amber-600 mx-1 shrink-0">◆</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
