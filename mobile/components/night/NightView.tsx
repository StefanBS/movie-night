import { useState, type ComponentProps } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { CalendarPlus, Clapperboard, Film, Pencil, Repeat, X } from "lucide-react-native";

import { AppButton, MemberRow, Poster, SectionLabel, Sheet, SheetRow, useToast } from "../";
import { useGroup } from "../GroupProvider";
import { Credit } from "./Credit";
import { WizardFooter } from "./WizardFooter";
import { addToCalendar } from "../../calendarExport";
import { firstName } from "../../lib/avatar";
import { calendarRecurrence, seriesNote, type CalendarRecurrence } from "../../lib/calendarEntry";
import { formatShortDate, formatWeekdayDate } from "../../lib/date";
import { nightActions, nightLine, nightWording, type NightAction } from "../../lib/nightLifecycle";
import { nightPicker, type Night } from "../../lib/nights";
import { formatRepeatLabel } from "../../lib/repeat";
import { borderWidth, createThemedStyles, fontFamily, fontSize, lh, radius, space, tabular, textPresets, useColors } from "../../theme";

type SheetAction = Omit<ComponentProps<typeof SheetRow>, "last">;

// NightView is the one screen for every saved night, past, tonight or ahead.
// The film leads, beside its poster (or an empty slot), and the picker is a
// credit line under it. A night without a film has one primary action, "Choose
// the film"; a night with one has none. The secondary actions (Change film,
// Edit night, Add to calendar, Clear film) sit in the sheet behind the ⋯
// button, which the editor's top bar opens through moreOpen; which of them
// show is nightActions' call (lib/nightLifecycle.ts). On a weekly
// night, Add to calendar first asks: the whole series, or just this night;
// the club's name (GroupProvider) titles the entry. `today` is passed in (mirrors lib/date.ts)
// for deterministic date framing. With `onDone` (the New night flow), the
// footer also ends the flow: "Done" is the main action once the film is in,
// and a ghost button under "Choose the film" while it isn't.
export function NightView({
  night,
  today,
  moreOpen,
  onCloseMore,
  onPickFilm,
  onClearFilm,
  onEdit,
  onDone,
}: {
  night: Night;
  today: string;
  moreOpen: boolean;
  onCloseMore: () => void;
  onPickFilm: () => void;
  onClearFilm: () => void;
  onEdit: () => void;
  onDone?: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const toast = useToast();
  const groupName = useGroup().group?.name ?? null;
  const wording = nightWording(night.scheduledFor, today);
  const movie = night.movie;
  const pickerName = nightPicker(night).name;
  const first = firstName(pickerName);
  const recurrence = calendarRecurrence(night.repeat);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const onAddToCalendar = async (rule: CalendarRecurrence | null) => {
    setCalendarOpen(false);
    if ((await addToCalendar(night, groupName, rule)) === "saved") {
      const recurring = rule !== null && night.repeat !== null ? `Recurring ${seriesNote(night.repeat, night.scheduledFor)}. ` : "";
      toast({ title: "Added to your calendar", body: `${recurring}It won't follow later changes to the night.` });
    }
  };

  // Each action closes the sheet before it runs.
  const act = (run: () => void) => () => {
    onCloseMore();
    run();
  };
  const sheetAction: Record<NightAction, () => SheetAction> = {
    changeFilm: () => ({ icon: Film, label: "Change film", sub: `Keeps the night and ${first}'s pick`, onPress: act(onPickFilm) }),
    edit: () => ({ icon: Pencil, label: "Edit night", sub: wording.editSub, onPress: act(onEdit) }),
    addToCalendar: () => ({
      icon: CalendarPlus,
      label: "Add to calendar",
      sub: recurrence !== null ? "The whole series, or just this night" : "A one-off event on this phone",
      onPress: act(() => (recurrence !== null ? setCalendarOpen(true) : void onAddToCalendar(null))),
    }),
    clearFilm: () => ({
      icon: X,
      label: "Clear film",
      sub: "The night stays; the film is removed",
      danger: true,
      onPress: act(onClearFilm),
    }),
  };
  const actions = nightActions(night, today, { web: Platform.OS === "web" }).map((kind) => sheetAction[kind]());

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          {movie !== null ? (
            <Poster uri={movie.posterUrl} title={movie.title} w={120} h={180} />
          ) : (
            <View style={styles.emptyPoster}>
              <Clapperboard size={28} color={colors.text.tertiary} />
            </View>
          )}
          <View style={styles.headText}>
            <Text style={styles.meta}>{nightLine(night, { countdown: "relative", date: "short" }, today)}</Text>
            {movie !== null ? (
              <Text style={styles.filmTitle} numberOfLines={4}>
                {movie.title}
              </Text>
            ) : (
              <Text style={[styles.filmTitle, styles.notPicked]}>Not picked yet.</Text>
            )}
            {movie !== null && movie.releaseYear !== null ? (
              <Text style={styles.year}>{movie.releaseYear}</Text>
            ) : null}
            {night.repeat !== null ? (
              <View style={styles.repeatChip}>
                <Repeat size={14} color={colors.text.secondary} />
                <Text style={styles.repeatText} numberOfLines={1}>
                  {formatRepeatLabel(night.repeat, night.scheduledFor)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.credit}>
          <Credit name={pickerName} pending={movie === null} />
        </View>
        {movie === null && wording.pickerNote !== null ? (
          <Text style={styles.note}>{wording.pickerNote(first)}</Text>
        ) : null}

        <SectionLabel>{wording.attendeesSection(night.attendees.length)}</SectionLabel>
        {night.attendees.map((a, i) => (
          <MemberRow
            key={a.id}
            name={a.name}
            divider={i < night.attendees.length - 1}
            right={a.id === night.pickerId ? <Text style={styles.tag}>Picker</Text> : undefined}
          />
        ))}
      </ScrollView>

      {movie === null ? (
        <WizardFooter>
          <AppButton title="Choose the film" fullWidth onPress={onPickFilm} />
          {onDone ? <AppButton title="Done" variant="ghost" fullWidth onPress={onDone} /> : null}
        </WizardFooter>
      ) : onDone ? (
        <WizardFooter>
          <AppButton title="Done" fullWidth onPress={onDone} />
        </WizardFooter>
      ) : null}

      <Sheet
        visible={moreOpen}
        title={movie !== null ? `${movie.title} · ${formatShortDate(night.scheduledFor)}` : formatWeekdayDate(night.scheduledFor)}
        onClose={onCloseMore}
      >
        {actions.map((a, i) => (
          <SheetRow key={a.label} {...a} last={i === actions.length - 1} />
        ))}
      </Sheet>

      {recurrence !== null && night.repeat !== null ? (
        <Sheet visible={calendarOpen} title="Add to calendar" onClose={() => setCalendarOpen(false)}>
          <SheetRow
            icon={Repeat}
            label="Add the whole series"
            sub={`${formatRepeatLabel(night.repeat, night.scheduledFor)}, recurring`}
            onPress={() => void onAddToCalendar(recurrence)}
          />
          <SheetRow icon={CalendarPlus} label="Just this night" sub="A one-off event" last onPress={() => void onAddToCalendar(null)} />
        </Sheet>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  flex: { flex: 1 },
  content: { paddingHorizontal: space[5], paddingTop: space[2], paddingBottom: space[6] },
  head: { flexDirection: "row", alignItems: "flex-end", gap: 18, marginTop: 10 },
  // The slot a poster will fill: a poster-shaped outline around a clapperboard.
  emptyPoster: {
    width: 120,
    height: 180,
    borderRadius: radius.sm,
    borderWidth: borderWidth.regular,
    borderColor: colors.border.strong,
    alignItems: "center",
    justifyContent: "center",
  },
  headText: { flex: 1, minWidth: 0, paddingBottom: space[1] },
  meta: { fontFamily: fontFamily.sansSemibold, fontSize: 13, lineHeight: lh(13), color: colors.text.secondary },
  filmTitle: { ...textPresets.filmTitle, fontSize: 32, lineHeight: 36, color: colors.text.primary, marginTop: space[2] },
  notPicked: { color: colors.text.tertiary },
  year: { ...textPresets.meta, ...tabular, color: colors.text.tertiary, marginTop: space[2] },
  // A repeating night's cadence ("Every Friday", ADR-0014): a quiet pill, not
  // the accent.
  repeatChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: space[3],
    paddingVertical: 6,
    paddingHorizontal: space[3],
    borderRadius: radius.full,
    backgroundColor: colors.surface.subtle,
  },
  repeatText: { fontFamily: fontFamily.sansSemibold, fontSize: 13, lineHeight: lh(13, "snug"), color: colors.text.secondary },
  credit: {
    marginTop: 22,
    paddingTop: space[4],
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.border.hairline,
  },
  note: { ...textPresets.meta, lineHeight: lh(fontSize.sm, "normal"), color: colors.text.secondary, marginTop: 14 },
  tag: { ...textPresets.meta, fontSize: 13, color: colors.text.tertiary },
}));
