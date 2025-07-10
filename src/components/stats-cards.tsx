import { Mail, AlertCircle, EyeOff, Star } from 'lucide-react'

interface StatsCardsProps {
  stats: {
    totalThreads: number
    actionRequired: number
    unread: number
    vipThreads: number
  }
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      name: 'Total Threads',
      value: stats.totalThreads,
      icon: Mail,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      name: 'Action Required',
      value: stats.actionRequired,
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
    },
    {
      name: 'Unread',
      value: stats.unread,
      icon: EyeOff,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    },
    {
      name: 'VIP Threads',
      value: stats.vipThreads,
      icon: Star,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.name}
          className="overflow-hidden rounded-lg bg-white dark:bg-gray-800 px-4 py-5 shadow sm:p-6"
        >
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className={`rounded-md p-3 ${card.bgColor}`}>
                <card.icon className={`h-6 w-6 ${card.color}`} />
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="truncate text-sm font-medium text-gray-500 dark:text-gray-400">
                  {card.name}
                </dt>
                <dd className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  {card.value}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}