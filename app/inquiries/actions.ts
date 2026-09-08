'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { InquiryStatus } from '@/lib/types'
import { notifyNewInquiry } from '@/lib/notify'

export async function submitInquiry(formData: FormData) {
  const supabase = await createClient()

  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim()
  if (!name || !email) {
    return { ok: false, error: 'Name and email are required.' }
  }

  const payload = {
    product_id: (formData.get('product_id') as string) || null,
    product_name: (formData.get('product_name') as string) || null,
    name,
    email,
    phone: (formData.get('phone') as string)?.trim() || null,
    company: (formData.get('company') as string)?.trim() || null,
    quantity: (formData.get('quantity') as string)?.trim() || null,
    message: (formData.get('message') as string)?.trim() || null,
  }

  const { error } = await supabase.from('inquiries').insert(payload)
  if (error) return { ok: false, error: 'Could not submit inquiry. Please try again.' }

  // Fire the team alert. notifyNewInquiry never throws, so a mail hiccup
  // can't fail the customer's submission.
  await notifyNewInquiry(payload)

  revalidatePath('/inquiries')
  return { ok: true }
}

export async function updateInquiryStatus(formData: FormData) {
  const id = formData.get('id') as string
  const status = formData.get('status') as InquiryStatus
  const adminNotes = formData.get('admin_notes') as string | null

  const supabase = await createClient()
  const update: Record<string, unknown> = {}
  if (status) update.status = status
  if (adminNotes !== null) update.admin_notes = adminNotes

  await supabase.from('inquiries').update(update).eq('id', id)
  revalidatePath('/inquiries')
  revalidatePath(`/inquiries/${id}`)
}

export async function deleteInquiry(formData: FormData) {
  const id = formData.get('id') as string
  const supabase = await createClient()
  await supabase.from('inquiries').delete().eq('id', id)
  revalidatePath('/inquiries')
}
