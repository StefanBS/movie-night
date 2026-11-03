import { type ReactNode } from "react";
import { Text, View } from "react-native";

import { Avatar } from "../Avatar";
import { firstName } from "../../lib/avatar";
import { createThemedStyles, fontFamily, lh } from "../../theme";

// Credit is the picker, set small under a film: "Picked by Priya" once there's
// a film, "Tomas is picking" before. `action` sits at the end of the line (the
// Pick step's "Change").
export function Credit({ name, pending, action }: { name: string; pending: boolean; action?: ReactNode }) {
  const styles = useStyles();
  const first = firstName(name);
  return (
    <View style={styles.row}>
      <Avatar name={name} size={28} />
      <Text style={styles.text} numberOfLines={1}>
        {pending ? (
          <>
            <Text style={styles.name}>{first}</Text> is picking
          </>
        ) : (
          <>
            Picked by <Text style={styles.name}>{first}</Text>
          </>
        )}
      </Text>
      {action}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  text: { flex: 1, minWidth: 0, fontFamily: fontFamily.sans, fontSize: 15, lineHeight: lh(15), color: colors.text.secondary },
  name: { fontFamily: fontFamily.sansSemibold, color: colors.text.primary },
}));
