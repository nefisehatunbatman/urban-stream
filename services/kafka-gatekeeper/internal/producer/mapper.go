package producer

import "strings"

// MapChannelToTopic Redis channel'ını Kafka topic'ine dönüştürür
// Örnek: city:traffic_lights → city.traffic_lights
func MapChannelToTopic(channel string) string {
	return strings.ReplaceAll(channel, ":", ".")
}
