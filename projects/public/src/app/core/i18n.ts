import { Injectable, Pipe, PipeTransform } from '@angular/core';

// Words on the public page, one list per language (PUBLIC_HOME_CONTEXT.md:
// English only for now; another language = another list here, and the
// language switch appears once there are two). Text typed by staff (news,
// session names) is shown as typed, not translated.
const EN = {
  'brand.name': 'Bloom in Green',
  'brand.sub': '{event} · Festival live',
  'nav.home': 'Home',
  'nav.schedule': 'Schedule',
  'nav.map': 'Map',
  'nav.plan': 'My plan',
  'nav.news': 'News',
  'hero.before.title': 'Almost time to',
  'hero.before.word': 'bloom',
  'hero.before.lead': '{event} · {days} days of music, workshops and green living',
  'hero.during.title': 'Day {n} is',
  'hero.during.word': 'blooming',
  'hero.during.lead': 'Welcome to {event}',
  'hero.after.title': 'Thank you,',
  'hero.after.word': 'bloomers',
  'hero.after.lead': '{event} is over. See you next year!',
  'hero.day': 'Day {n}',
  'count.days': 'days',
  'count.hours': 'hours',
  'count.mins': 'mins',
  'fresh.live': 'Live',
  'fresh.now': 'Live · just updated',
  'fresh.ago': 'Live · {s}s ago',
  'fresh.offline': 'Offline · updated {time}',
  'fresh.ok': 'Up to date',
  'soon.title': 'Coming soon',
  'soon.home': "What's on right now, what's next, the map and news will appear here.",
  'soon.schedule': 'The full schedule of the day will appear here.',
  'soon.map': 'The festival map with water, first aid, toilets and stages will appear here.',
  'soon.plan': 'Star the sessions you love and keep them here, on this phone.',
  'soon.news': 'News and updates from the organisers will appear here.',
  'off.title': 'The festival page is resting',
  'off.text': 'It opens a little before the festival. Check back soon!',
  'offline.title': "You're offline",
  'offline.text': 'Connect to the internet once, and this page will work offline after that.',
  'offline.retry': 'Try again',
  'live.title': 'Live now',
  'live.hand': 'walk in!',
  'live.left': '{n} min left',
  'next.title': 'Up next',
  'next.preview': 'Day 1 preview',
  'next.hand': 'tap for details',
  'next.inMin': 'in {n} min',
  'next.empty': 'Nothing else today.',
  'next.emptyCat': 'Nothing else in this category today.',
  'next.full': 'Full schedule',
  'sched.title': 'Schedule',
  'sched.hand': 'all of it',
  'sched.empty': 'No sessions on this day.',
  'cat.all': 'All',
  'st.soon': 'Registration opens {time}',
  'st.reg': 'Registration open at the venue',
  'st.regFull': 'Full · waitlist at the venue',
  'st.regclosed': 'Entry opens {time}',
  'st.list': 'Entry for registered · walk-ins from {time}',
  'st.open': 'Walk in',
  'st.openStarts': 'Walk in · starts {time}',
  'st.full': 'Full',
  'st.closed': 'Entry closed',
  'st.ended': 'Ended',
  'st.cancelled': 'Cancelled',
  'places.left': '{n} places left',
  'places.one': '1 place left',
  'sheet.close': 'Close',
  'sheet.with': 'With {names}',
  'sheet.age': 'Age',
  'sheet.language': 'Language',
  'sheet.bring': 'Bring',
  'sheet.items': 'Needed',
  'foot.privacy': 'No sign-in. Nothing about you is stored.',
  'foot.lang': 'English',
};

export type WordKey = keyof typeof EN;
const LISTS: Record<string, Record<WordKey, string>> = { en: EN };

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly languages = Object.keys(LISTS);
  lang = 'en';

  t(key: WordKey, params?: Record<string, string | number>): string {
    const text = LISTS[this.lang]?.[key] ?? EN[key] ?? key;
    return params ? text.replace(/\{(\w+)\}/g, (all, name) => name in params ? String(params[name]) : all) : text;
  }
}

/** {{ 'nav.home' | t }} or {{ 'hero.day' | t: { n: 2 } }} */
@Pipe({ name: 't', standalone: true })
export class TPipe implements PipeTransform {
  constructor(private i18n: I18nService) {}
  transform(key: WordKey, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }
}
