package producer

import "strings"

// Redis channel → Kafka topic
func MapChannelToTopic(channel string) string {
	return strings.ReplaceAll(channel, ":", ".")
}
