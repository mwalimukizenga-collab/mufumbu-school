import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import DashboardTopicScores from './DashboardTopicScores'
import {
  BookOpen, Plus, X, Pencil, Trash2, Loader, ChevronDown, Check,
  AlertTriangle, FileText, Timer,
} from 'lucide-react'

function TeacherTopicView() {
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { user } = useAuth()
  const [teacherId, setTeacherId] = useState(null)
  const [topicForm, setTopicForm] = useState(null)
  const [scoreTopic, setScoreTopic] = useState(null)
  const [dismissAlert, setDismissAlert] = useState(false)
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedAssignment, setSelectedAssignment] = useState('all')

  useEffect(() => {
    if (!user) return
    supabase.from('teachers').select('id').eq('profile_id', user.id).single()
      .then(({ data, error }) => {
        if (!error && data) setTeacherId(data.id)
      })
  }, [user])

  const { data: assignments, isLoading: loadAs } = useQuery({
    queryKey: ['teacher_assignments', teacherId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_assignments')
        .select('*, subjects(name, code, level), classes(name, level)')
        .eq('teacher_id', teacherId)
        .order('id')
      if (error) throw error
      return data
    },
    enabled: !!teacherId,
  })

  const { data: allTopics, isLoading: loadTopics } = useQuery({
    queryKey: ['syllabus_topics', teacherId],
    queryFn: async () => {
      if (!assignments?.length) return []
      const ids = assignments.map(a => a.id)
      const { data, error } = await supabase
        .from('syllabus_topics')
        .select('*')
        .in('assignment_id', ids)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!assignments?.length,
  })

  const assignmentMap = useMemo(() => {
    const m = {}
    assignments?.forEach(a => { m[a.id] = a })
    return m
  }, [assignments])

  const topicsWithAssignment = useMemo(() => {
    if (!allTopics) return []
    return allTopics.map(t => ({ ...t, assignment: assignmentMap[t.assignment_id] }))
  }, [allTopics, assignmentMap])

  const filteredTopics = useMemo(() => {
    let items = topicsWithAssignment
    if (statusFilter !== 'all') items = items.filter(t => t.status === statusFilter)
    if (selectedAssignment !== 'all') items = items.filter(t => t.assignment_id === Number(selectedAssignment))
    return items
  }, [topicsWithAssignment, statusFilter, selectedAssignment])

  const assignmentsWithNoTopics = useMemo(() => {
    if (!assignments || !allTopics) return []
    const topicAssignIds = new Set(allTopics.map(t => t.assignment_id))
    return assignments.filter(a => !topicAssignIds.has(a.id))
  }, [assignments, allTopics])

  const createMutation = useMutation({
    mutationFn: async (form) => {
      if (!form.topic_name?.trim()) throw new Error('Topic name is required.')
      if (!form.assignment_id) throw new Error('Please select a subject.')
      const { error } = await supabase.from('syllabus_topics').insert({
        assignment_id: Number(form.assignment_id),
        topic_name: form.topic_name.trim(),
        competency: form.competency?.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: 'in_progress',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['syllabus_topics'] })
      toast.success('Topic added.')
      setTopicForm(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }) => {
      const { error } = await supabase.from('syllabus_topics').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['syllabus_topics'] })
      toast.success('Topic updated.')
      setTopicForm(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('syllabus_topics').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['syllabus_topics'] })
      toast.success('Topic removed.')
    },
    onError: (err) => toast.error(err.message),
  })

  const handleDelete = async (topic) => {
    const ok = await confirm({
      title: 'Delete topic?',
      message: `"${topic.topic_name}" will be permanently removed.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (ok) deleteMutation.mutate(topic.id)
  }

  const getStatusBadge = (status) => {
    const styles = {
      not_started: 'bg-gray-100 text-gray-600',
      in_progress: 'bg-blue-100 text-blue-700',
      completed: 'bg-green-100 text-green-700',
    }
    return styles[status] || styles.not_started
  }

  if (!teacherId && user) {
    return (
      <div className="flex justify-center py-16">
        <Loader size={28} className="animate-spin text-green-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Score entry embedded */}
      {scoreTopic && (
        <DashboardTopicScores
          topic={scoreTopic}
          assignment={assignmentMap[scoreTopic.assignment_id]}
          onClose={() => { setScoreTopic(null); qc.invalidateQueries({ queryKey: ['syllabus_topics'] }) }}
        />
      )}

      {/* Alert: assignments with no topics */}
      {!dismissAlert && assignmentsWithNoTopics.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 relative">
          <button onClick={() => setDismissAlert(true)}
            className="absolute top-3 right-3 text-amber-400 hover:text-amber-600 transition">
            <X size={16} />
          </button>
          <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
            <AlertTriangle size={16} />
            Topics not yet created for:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {assignmentsWithNoTopics.map(a => (
              <span key={a.id} className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-medium">
                {a.subjects?.name} — {a.classes?.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Add Topic Button + Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">My Topics</h2>
          <p className="text-sm text-gray-500">Plan and track your teaching progress</p>
        </div>
        <button onClick={() => setTopicForm({ assignment_id: '', topic_name: '', competency: '', start_date: '', end_date: '', editing: false })}
          className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition">
          <Plus size={16} /> New Topic
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <select value={selectedAssignment} onChange={e => setSelectedAssignment(e.target.value)}
            className="appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-green-500 outline-none cursor-pointer">
            <option value="all">All Subjects</option>
            {assignments?.map(a => (
              <option key={a.id} value={a.id}>{a.subjects?.name} — {a.classes?.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-green-500 outline-none cursor-pointer">
            <option value="all">All Status</option>
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Loading */}
      {(loadAs || loadTopics) && (
        <div className="flex justify-center py-16"><Loader size={28} className="animate-spin text-green-600" /></div>
      )}

      {/* Empty state */}
      {!loadAs && !loadTopics && filteredTopics.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <BookOpen size={40} className="mx-auto mb-3 opacity-50" />
          <p className="font-medium">No topics yet</p>
          <p className="text-sm mt-1">Click "New Topic" to start planning.</p>
        </div>
      )}

      {/* Topic List */}
      {!loadAs && !loadTopics && filteredTopics.map(topic => (
        <div key={topic.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900">{topic.topic_name}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${getStatusBadge(topic.status)}`}>
                    {topic.status.replace('_', ' ')}
                  </span>
                </div>
                {topic.assignment && (
                  <p className="text-xs text-gray-500 mt-1">
                    {topic.assignment.subjects?.name} ({topic.assignment.subjects?.code}) — {topic.assignment.classes?.name}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {topic.status !== 'completed' && (
                  <button onClick={() => setScoreTopic(topic)}
                    className="text-xs text-green-700 font-medium hover:underline px-2 py-1" title="Enter scores">
                    <Check size={15} />
                  </button>
                )}
                <button onClick={() => setTopicForm({
                  id: topic.id, editing: true,
                  assignment_id: topic.assignment_id,
                  topic_name: topic.topic_name,
                  competency: topic.competency || '',
                  start_date: topic.start_date || '',
                  end_date: topic.end_date || '',
                })}
                  className="p-1.5 text-gray-400 hover:text-green-600 transition" title="Edit">
                  <Pencil size={15} />
                </button>
                <button onClick={() => handleDelete(topic)}
                  className="p-1.5 text-gray-400 hover:text-red-600 transition" title="Delete">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {topic.competency && (
              <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                <span className="font-medium text-gray-700">Competency:</span> {topic.competency}
              </div>
            )}

            {(topic.start_date || topic.end_date) && (
              <div className="flex items-center gap-4 text-xs text-gray-500">
                {topic.start_date && (
                  <span className="flex items-center gap-1">
                    <Timer size={12} /> Start: {topic.start_date}
                  </span>
                )}
                {topic.end_date && (
                  <span className="flex items-center gap-1">
                    <Timer size={12} /> End: {topic.end_date}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Topic Form Modal */}
      {topicForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-semibold text-gray-900">{topicForm.editing ? 'Edit Topic' : 'New Topic'}</h3>
              <button onClick={() => setTopicForm(null)} className="text-gray-400 hover:text-gray-600 transition"><X size={18} /></button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject & Class *</label>
                <select
                  value={topicForm.assignment_id}
                  onChange={e => setTopicForm({ ...topicForm, assignment_id: e.target.value })}
                  disabled={topicForm.editing}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none bg-white">
                  <option value="">Select...</option>
                  {assignments?.map(a => (
                    <option key={a.id} value={a.id}>{a.subjects?.name} — {a.classes?.name}</option>
                  ))}
                </select>
                {topicForm.editing && <p className="text-xs text-gray-400 mt-1">Subject cannot be changed after creation.</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Topic Name *</label>
                <input type="text" value={topicForm.topic_name}
                  onChange={e => setTopicForm({ ...topicForm, topic_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Competency</label>
                <textarea value={topicForm.competency}
                  onChange={e => setTopicForm({ ...topicForm, competency: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none resize-none"
                  placeholder="What students should be able to do..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input type="date" value={topicForm.start_date}
                    onChange={e => setTopicForm({ ...topicForm, start_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input type="date" value={topicForm.end_date}
                    onChange={e => setTopicForm({ ...topicForm, end_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setTopicForm(null)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition">
                Cancel
              </button>
              <button
                onClick={() => {
                  const mut = topicForm.editing ? updateMutation : createMutation
                  mut.mutate(topicForm)
                }}
                disabled={!topicForm.topic_name || !topicForm.assignment_id || createMutation.isPending || updateMutation.isPending}
                className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition flex items-center justify-center gap-2">
                {(createMutation.isPending || updateMutation.isPending) ? <Loader size={15} className="animate-spin" /> : null}
                {topicForm.editing ? 'Update' : 'Add Topic'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DashboardTopics() {
  return <TeacherTopicView />
}
