import React from "react";
import { View, Text, StyleSheet } from "react-native";

const Example1 = (props) => (
  <View>
    <Text style={styles.text1}>{props.name}</Text>
    <Text style={[styles.text2, styles.text5]}>age</Text>
    <Text style={styles.text3}>nomi3</Text>
    <Text style={styles.text4}>nomi4</Text>
    <Text style={[styles.text4, { color: "red" }, styles.text6]}>nomi4</Text>
  </View>
);

export default Example1;

const styles = StyleSheet.create({
  text1: {
    fontSize: 1,
  },
  text2: {
    fontSize: 2,
  },
  text3: {
    fontSize: 3,
  },
  text4: {
    fontSize: 4,
  },
  text5: {
    fontSize: 5,
  },
  text6: {
    fontSize: 5,
  },
});
