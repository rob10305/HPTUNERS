import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/sessionStore'

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const session = getSession(params.sessionId)

  if (!session) {
    return NextResponse.json(
      { error: 'Session not found or expired' },
      { status: 404 }
    )
  }

  // Exclude raw tuneData tables from the response to keep payload small
  // The client only needs results, not the full parsed table arrays
  const { tuneData, ...rest } = session

  return NextResponse.json({
    ...rest,
    tuneDataMeta: tuneData
      ? {
          source: tuneData.source,
          vehicle: tuneData.vehicle,
          rawFlags: tuneData.rawFlags,
          hasDatalog: !!tuneData.datalog?.rows?.length,
          tableKeys: Object.keys(tuneData.tables).filter(
            (k) => tuneData.tables[k as keyof typeof tuneData.tables] != null
          ),
        }
      : null,
  })
}
